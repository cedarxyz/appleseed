/**
 * Appleseed Daemon
 *
 * Automated scheduled runner for the distribution pipeline.
 * Runs scan → qualify → verify → airdrop → sync on a configurable interval.
 */

import { loadConfig, validateConfig } from "./config";
import { initDatabase, closeDatabase, getStats, getProspects } from "./db";
import { scan } from "./scanner";
import { qualify } from "./qualifier";
import { verify } from "./verifier";
import { airdrop, checkTreasury } from "./airdrop";
import { formatSats } from "./wallet";
import type { DiscoveryStrategy } from "./types";

// =============================================================================
// Configuration
// =============================================================================

interface DaemonConfig {
  // Interval between runs (in minutes)
  intervalMinutes: number;

  // Which strategies to scan
  strategies: DiscoveryStrategy[];

  // Limits per run
  scanLimit: number;
  outreachLimit: number;
  airdropLimit: number;

  // Feature flags
  enableScan: boolean;
  enableQualify: boolean;
  enableVerify: boolean;
  enableAirdrop: boolean;
  enableSync: boolean;

  // Sync API URL
  syncApiUrl: string;
}

const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  intervalMinutes: 60, // Run every hour
  strategies: ["mcp", "langchain", "bitcoin_ai"],
  scanLimit: 50,
  outreachLimit: 0, // Disabled by default - outreach requires manual review
  airdropLimit: 5,
  enableScan: true,
  enableQualify: true,
  enableVerify: true,
  enableAirdrop: true,
  enableSync: true,
  syncApiUrl: process.env.APPLESEED_API_URL || "https://appleseed-api.c3dar.workers.dev",
};

// =============================================================================
// Logging
// =============================================================================

function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function logSection(title: string): void {
  log(`\n${"=".repeat(60)}`);
  log(title);
  log("=".repeat(60));
}

// =============================================================================
// Sync Function
// =============================================================================

async function syncToCloud(apiUrl: string): Promise<{ success: boolean; synced: number }> {
  const prospects = getProspects({ limit: 10000 });
  const stats = getStats();

  if (prospects.length === 0) {
    return { success: true, synced: 0 };
  }

  const syncData = {
    prospects: prospects.map((p) => ({
      github_username: p.githubUsername,
      github_id: p.githubId,
      email: p.email,
      repos_json: JSON.stringify(p.repos),
      score: p.score,
      tier: p.tier,
      discovered_via: p.discoveredVia,
      outreach_status: p.outreachStatus,
      target_repo: p.targetRepo,
      pr_url: p.prUrl,
      pr_number: p.prNumber,
      pr_opened_at: p.prOpenedAt,
      stacks_address: p.stacksAddress,
      address_valid: p.addressValid ? 1 : 0,
      verified_at: p.verifiedAt,
      airdrop_status: p.airdropStatus,
      airdrop_txid: p.airdropTxid,
      airdrop_amount_sats: p.airdropAmountSats,
      airdrop_sent_at: p.airdropSentAt,
      yield_enrolled: p.yieldEnrolled ? 1 : 0,
      yield_protocol: p.yieldProtocol,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    })),
    daily_limits: {
      date: new Date().toISOString().split("T")[0],
      prs_opened: stats.todayPRs,
      airdrops_sent: stats.todayAirdrops,
    },
  };

  const res = await fetch(`${apiUrl}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(syncData),
  });

  if (!res.ok) {
    throw new Error(`Sync failed: ${res.status}`);
  }

  const result = await res.json() as { success: boolean; synced: number };
  return result;
}

// =============================================================================
// Pipeline Steps
// =============================================================================

async function runScan(config: DaemonConfig): Promise<number> {
  logSection("SCAN");

  const statsBefore = getStats();
  let totalCandidates = 0;

  // Run scan for each strategy
  for (const strategy of config.strategies) {
    log(`Scanning strategy: ${strategy}`);
    try {
      const results = await scan({
        strategy,
        limit: Math.ceil(config.scanLimit / config.strategies.length),
        dryRun: false,
        daysSinceActivity: 90,
      });
      totalCandidates += results.length;
    } catch (error) {
      log(`  Error: ${error}`);
    }
  }

  const statsAfter = getStats();
  const newProspects = statsAfter.totalProspects - statsBefore.totalProspects;

  log(`Scanned ${totalCandidates} candidates, saved ${newProspects} new prospects`);
  return newProspects;
}

async function runQualify(): Promise<number> {
  logSection("QUALIFY");

  try {
    const results = await qualify({ pendingOnly: true });
    log(`Qualified ${results.qualified} prospects, skipped ${results.skipped}`);
    return results.qualified;
  } catch (error) {
    log(`Error: ${error}`);
    return 0;
  }
}

async function runVerify(): Promise<number> {
  logSection("VERIFY");

  try {
    const results = await verify({ poll: false });
    log(`Verified: ${results.verified}, Invalid: ${results.invalid}, Pending: ${results.pending}`);
    return results.verified;
  } catch (error) {
    log(`Error: ${error}`);
    return 0;
  }
}

async function runAirdrop(limit: number): Promise<number> {
  logSection("AIRDROP");

  const appConfig = loadConfig();

  // Check treasury first
  const treasury = await checkTreasury(appConfig);
  log(`Treasury balance: ${formatSats(treasury.sbtcBalance)}`);

  if (!treasury.canAirdrop) {
    log("Treasury balance too low, skipping airdrops");
    return 0;
  }

  try {
    const results = await airdrop({
      pendingOnly: true,
      limit,
      dryRun: false,
    }, appConfig);
    log(`Sent: ${results.sent}, Failed: ${results.failed}, Skipped: ${results.skipped}`);
    return results.sent;
  } catch (error) {
    log(`Error: ${error}`);
    return 0;
  }
}

async function runSync(apiUrl: string): Promise<number> {
  logSection("SYNC");

  try {
    const result = await syncToCloud(apiUrl);
    log(`Synced ${result.synced} prospects to cloud`);
    return result.synced;
  } catch (error) {
    log(`Error: ${error}`);
    return 0;
  }
}

// =============================================================================
// Main Run
// =============================================================================

async function runPipeline(daemonConfig: DaemonConfig): Promise<void> {
  const startTime = Date.now();

  logSection("APPLESEED DAEMON RUN");
  log(`Started at ${new Date().toISOString()}`);

  // Show current stats
  const statsBefore = getStats();
  log(`Current prospects: ${statsBefore.totalProspects}`);
  log(`  Tier A: ${statsBefore.byTier.A}, B: ${statsBefore.byTier.B}, C: ${statsBefore.byTier.C}`);
  log(`  Verified: ${statsBefore.verified}, Airdropped: ${statsBefore.byAirdropStatus.confirmed + statsBefore.byAirdropStatus.sent}`);

  // Run pipeline steps
  if (daemonConfig.enableScan) {
    await runScan(daemonConfig);
  }

  if (daemonConfig.enableQualify) {
    await runQualify();
  }

  if (daemonConfig.enableVerify) {
    await runVerify();
  }

  if (daemonConfig.enableAirdrop) {
    await runAirdrop(daemonConfig.airdropLimit);
  }

  if (daemonConfig.enableSync) {
    await runSync(daemonConfig.syncApiUrl);
  }

  // Show stats after
  const statsAfter = getStats();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  logSection("RUN COMPLETE");
  log(`Duration: ${elapsed}s`);
  log(`Prospects: ${statsBefore.totalProspects} → ${statsAfter.totalProspects} (+${statsAfter.totalProspects - statsBefore.totalProspects})`);
  log(`Verified: ${statsBefore.verified} → ${statsAfter.verified}`);
  log(`Airdropped: ${statsBefore.byAirdropStatus.confirmed + statsBefore.byAirdropStatus.sent} → ${statsAfter.byAirdropStatus.confirmed + statsAfter.byAirdropStatus.sent}`);
}

// =============================================================================
// CLI Entry
// =============================================================================

function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        result[key] = nextArg;
        i++;
      } else {
        result[key] = true;
      }
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
Appleseed Daemon - Automated Pipeline Runner

USAGE:
  npx tsx src/daemon.ts [options]

OPTIONS:
  --once              Run once and exit (default: run continuously)
  --interval <min>    Minutes between runs (default: 60)
  --scan-limit <n>    Max prospects to scan per run (default: 50)
  --no-scan           Disable scanning
  --no-qualify        Disable qualifying
  --no-verify         Disable verification
  --no-airdrop        Disable airdrops
  --no-sync           Disable cloud sync
  --help              Show this help

EXAMPLES:
  # Run once
  npx tsx src/daemon.ts --once

  # Run every 30 minutes
  npx tsx src/daemon.ts --interval 30

  # Run continuously, scan only
  npx tsx src/daemon.ts --no-verify --no-airdrop
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // Load and validate config
  const appConfig = loadConfig();
  const errors = validateConfig(appConfig);
  if (errors.length > 0) {
    console.error("Configuration errors:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  // Build daemon config from args
  const daemonConfig: DaemonConfig = {
    ...DEFAULT_DAEMON_CONFIG,
    intervalMinutes: args.interval ? parseInt(args.interval as string, 10) : DEFAULT_DAEMON_CONFIG.intervalMinutes,
    scanLimit: args["scan-limit"] ? parseInt(args["scan-limit"] as string, 10) : DEFAULT_DAEMON_CONFIG.scanLimit,
    enableScan: !args["no-scan"],
    enableQualify: !args["no-qualify"],
    enableVerify: !args["no-verify"],
    enableAirdrop: !args["no-airdrop"],
    enableSync: !args["no-sync"],
  };

  // Initialize database
  initDatabase(appConfig.dbPath);

  try {
    if (args.once) {
      // Run once and exit
      await runPipeline(daemonConfig);
    } else {
      // Run continuously
      log(`Starting daemon with ${daemonConfig.intervalMinutes} minute interval`);
      log(`Features: scan=${daemonConfig.enableScan}, qualify=${daemonConfig.enableQualify}, verify=${daemonConfig.enableVerify}, airdrop=${daemonConfig.enableAirdrop}, sync=${daemonConfig.enableSync}`);

      // Run immediately
      await runPipeline(daemonConfig);

      // Then run on interval
      const intervalMs = daemonConfig.intervalMinutes * 60 * 1000;
      setInterval(async () => {
        try {
          await runPipeline(daemonConfig);
        } catch (error) {
          log(`Pipeline error: ${error}`);
        }
      }, intervalMs);

      // Keep process alive
      log(`\nDaemon running. Next run in ${daemonConfig.intervalMinutes} minutes. Press Ctrl+C to stop.`);
    }
  } catch (error) {
    console.error("Fatal error:", error);
    closeDatabase();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
