#!/usr/bin/env bun
/**
 * Appleseed v2 CLI
 *
 * Distribution engine for aibtc-cli - find AI builders, deliver PR outreach,
 * verify wallets, and airdrop sBTC.
 */

import { loadConfig, validateConfig } from "./config";
import { initDatabase, closeDatabase, getStats, getProspects, getProspectById } from "./db";
import { scan, listStrategies } from "./scanner";
import { qualify, qualifyProspect, explainBreakdown } from "./qualifier";
import { outreach } from "./outreach";
import { verify, manualVerify } from "./verifier";
import { airdrop, checkTreasury } from "./airdrop";
import { formatSats, formatStx } from "./wallet";
import type { DiscoveryStrategy, Tier } from "./types";

// =============================================================================
// CLI Helpers
// =============================================================================

function printUsage(): void {
  console.log(`
Appleseed v2 - Distribution Engine for aibtc-cli

USAGE:
  bun run src/index.ts <command> [options]

COMMANDS:
  scan        Discover AI/agent builders on GitHub
  qualify     Score and tier prospects
  outreach    Send PR-based outreach
  verify      Monitor PR comments for wallet addresses
  airdrop     Distribute sBTC to verified builders
  status      Show prospect details
  stats       Show overall statistics
  treasury    Check treasury wallet balance
  sync        Sync local database to cloud (Cloudflare D1)

SCAN OPTIONS:
  --strategy <name>   Search strategy: mcp, langchain, autogpt, crewai, bitcoin_ai, all
  --limit <n>         Maximum prospects to find (default: 50)
  --dry-run           Don't save to database
  --days <n>          Only include repos active within N days (default: 90)

QUALIFY OPTIONS:
  --pending           Only qualify unqualified prospects
  --prospect-id <id>  Qualify specific prospect
  --min-tier <tier>   Only keep prospects at or above tier (A, B, C)

OUTREACH OPTIONS:
  --tier <tier>       Only contact prospects of this tier
  --limit <n>         Maximum PRs to send (default: 10)
  --dry-run           Preview without sending
  --prospect-id <id>  Send to specific prospect

VERIFY OPTIONS:
  --poll              Continuously poll for new comments
  --interval <sec>    Poll interval in seconds (default: 300)
  --pr-url <url>      Check specific PR

AIRDROP OPTIONS:
  --pending           Process all pending airdrops (default)
  --limit <n>         Maximum airdrops to send (default: 5)
  --prospect-id <id>  Airdrop to specific prospect
  --amount <sats>     Override airdrop amount

STATUS OPTIONS:
  --prospect-id <id>  Show specific prospect
  --tier <tier>       Filter by tier
  --limit <n>         Maximum to show (default: 20)

EXAMPLES:
  bun run src/index.ts scan --strategy mcp --limit 10 --dry-run
  bun run src/index.ts qualify --pending
  bun run src/index.ts outreach --tier A --limit 5 --dry-run
  bun run src/index.ts verify --poll --interval 300
  bun run src/index.ts airdrop --pending --limit 3
  bun run src/index.ts stats
`);
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];

      if (next && !next.startsWith("--")) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    } else if (!parsed._command) {
      parsed._command = arg;
    }
  }

  return parsed;
}

// =============================================================================
// Commands
// =============================================================================

async function cmdScan(args: Record<string, string | boolean>): Promise<void> {
  const strategy = (args.strategy as string) || "all";
  const limit = parseInt((args.limit as string) || "50", 10);
  const dryRun = Boolean(args["dry-run"]);
  const days = parseInt((args.days as string) || "90", 10);

  if (strategy !== "all" && !listStrategies().includes(strategy as DiscoveryStrategy)) {
    console.error(`Invalid strategy: ${strategy}`);
    console.log(`Available: ${listStrategies().join(", ")}, all`);
    process.exit(1);
  }

  await scan({
    strategy: strategy as DiscoveryStrategy | "all",
    limit,
    dryRun,
    daysSinceActivity: days,
  });
}

async function cmdQualify(args: Record<string, string | boolean>): Promise<void> {
  const pending = Boolean(args.pending);
  const prospectId = args["prospect-id"]
    ? parseInt(args["prospect-id"] as string, 10)
    : undefined;
  const minTier = args["min-tier"] as Tier | undefined;

  await qualify({ pending, prospectId, minTier });
}

async function cmdOutreach(args: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();
  const errors = validateConfig(config);

  if (errors.length > 0 && !args["dry-run"]) {
    console.error("Configuration errors:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  const tier = args.tier as Tier | undefined;
  const limit = parseInt((args.limit as string) || "10", 10);
  const dryRun = Boolean(args["dry-run"]);
  const prospectId = args["prospect-id"]
    ? parseInt(args["prospect-id"] as string, 10)
    : undefined;

  await outreach({ tier, limit, dryRun, prospectId }, config);
}

async function cmdVerify(args: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();

  const poll = Boolean(args.poll);
  const interval = parseInt((args.interval as string) || "300", 10);
  const prUrl = args["pr-url"] as string | undefined;

  await verify({ poll, interval, prUrl }, config);
}

async function cmdAirdrop(args: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();
  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error("Configuration errors:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  const pending = !args["prospect-id"]; // Default to pending unless specific prospect
  const limit = parseInt((args.limit as string) || "5", 10);
  const prospectId = args["prospect-id"]
    ? parseInt(args["prospect-id"] as string, 10)
    : undefined;
  const amount = args.amount
    ? parseInt(args.amount as string, 10)
    : undefined;

  await airdrop({ pending, limit, prospectId, amount }, config);
}

async function cmdStatus(args: Record<string, string | boolean>): Promise<void> {
  const prospectId = args["prospect-id"]
    ? parseInt(args["prospect-id"] as string, 10)
    : undefined;
  const tier = args.tier as Tier | undefined;
  const limit = parseInt((args.limit as string) || "20", 10);

  if (prospectId) {
    // Show specific prospect
    const prospect = getProspectById(prospectId);

    if (!prospect) {
      console.log(`Prospect #${prospectId} not found`);
      return;
    }

    console.log(`\nProspect #${prospect.id}: ${prospect.githubUsername}`);
    console.log(`  Tier: ${prospect.tier || "Unqualified"} (Score: ${prospect.score})`);
    console.log(`  Discovered via: ${prospect.discoveredVia || "unknown"}`);
    console.log(`  Repos: ${prospect.repos.length}`);

    console.log(`\n  Outreach:`);
    console.log(`    Status: ${prospect.outreachStatus}`);
    console.log(`    Target: ${prospect.targetRepo || "none"}`);
    console.log(`    PR: ${prospect.prUrl || "none"}`);

    console.log(`\n  Verification:`);
    console.log(`    Address: ${prospect.stacksAddress || "none"}`);
    console.log(`    Valid: ${prospect.addressValid ? "Yes" : "No"}`);

    console.log(`\n  Airdrop:`);
    console.log(`    Status: ${prospect.airdropStatus}`);
    console.log(`    Amount: ${prospect.airdropAmountSats ? formatSats(prospect.airdropAmountSats) : "none"}`);
    console.log(`    TX: ${prospect.airdropTxid || "none"}`);

    console.log(`\n  Yield:`);
    console.log(`    Enrolled: ${prospect.yieldEnrolled ? "Yes" : "No"}`);
    console.log(`    Protocol: ${prospect.yieldProtocol || "none"}`);

    // Show scoring breakdown if qualified
    if (prospect.tier) {
      const result = qualifyProspect(prospect);
      console.log(`\n  Scoring Breakdown:`);
      console.log(explainBreakdown(result.breakdown));
      console.log(`\n  Personalization Hooks:`);
      result.personalizationHooks.forEach((h) => console.log(`    - ${h}`));
    }
  } else {
    // List prospects
    const prospects = getProspects({ tier, limit });

    console.log(`\nProspects (${prospects.length}):\n`);
    console.log("ID\tTier\tScore\tOutreach\tAirdrop\t\tUsername");
    console.log("-".repeat(80));

    for (const p of prospects) {
      console.log(
        `${p.id}\t${p.tier || "-"}\t${p.score}\t${p.outreachStatus}\t${p.airdropStatus}\t\t${p.githubUsername}`
      );
    }
  }
}

async function cmdStats(): Promise<void> {
  const stats = getStats();

  console.log(`\n=== Appleseed v2 Statistics ===\n`);

  console.log(`Total Prospects: ${stats.totalProspects}`);

  console.log(`\nBy Tier:`);
  console.log(`  A (Hot):     ${stats.byTier.A}`);
  console.log(`  B (Warm):    ${stats.byTier.B}`);
  console.log(`  C (Cool):    ${stats.byTier.C}`);
  console.log(`  D (Skip):    ${stats.byTier.D}`);
  console.log(`  Unqualified: ${stats.byTier.unqualified}`);

  console.log(`\nOutreach Status:`);
  console.log(`  Pending:   ${stats.byOutreachStatus.pending}`);
  console.log(`  PR Opened: ${stats.byOutreachStatus.pr_opened}`);
  console.log(`  PR Merged: ${stats.byOutreachStatus.pr_merged}`);
  console.log(`  PR Closed: ${stats.byOutreachStatus.pr_closed}`);
  console.log(`  Declined:  ${stats.byOutreachStatus.declined}`);

  console.log(`\nAirdrop Status:`);
  console.log(`  Pending:   ${stats.byAirdropStatus.pending}`);
  console.log(`  Sent:      ${stats.byAirdropStatus.sent}`);
  console.log(`  Confirmed: ${stats.byAirdropStatus.confirmed}`);
  console.log(`  Failed:    ${stats.byAirdropStatus.failed}`);

  console.log(`\nVerified Addresses: ${stats.verified}`);
  console.log(`Yield Enrolled: ${stats.yieldEnrolled}`);

  console.log(`\nToday's Activity:`);
  console.log(`  PRs Opened: ${stats.todayPRs}`);
  console.log(`  Airdrops:   ${stats.todayAirdrops}`);

  // Funnel visualization
  const total = stats.totalProspects;
  const qualified = total - stats.byTier.unqualified;
  const contacted = stats.byOutreachStatus.pr_opened +
    stats.byOutreachStatus.pr_merged +
    stats.byOutreachStatus.pr_closed;
  const verified = stats.verified;
  const airdropped = stats.byAirdropStatus.confirmed + stats.byAirdropStatus.sent;

  console.log(`\n=== Funnel ===`);
  console.log(`Scanned → Qualified → Contacted → Verified → Airdropped`);
  console.log(`${total} → ${qualified} → ${contacted} → ${verified} → ${airdropped}`);

  if (total > 0) {
    console.log(
      `     (${((qualified / total) * 100).toFixed(0)}%)   (${contacted > 0 ? ((contacted / qualified) * 100).toFixed(0) : 0}%)   (${contacted > 0 ? ((verified / contacted) * 100).toFixed(0) : 0}%)   (${verified > 0 ? ((airdropped / verified) * 100).toFixed(0) : 0}%)`
    );
  }
}

async function cmdTreasury(): Promise<void> {
  const config = loadConfig();
  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error("Configuration errors:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log("\nChecking treasury...");

  const treasury = await checkTreasury(config);

  console.log(`\nTreasury Wallet:`);
  console.log(`  Address: ${treasury.address}`);
  console.log(`  STX Balance: ${formatStx(treasury.stxBalance)}`);
  console.log(`  sBTC Balance: ${formatSats(treasury.sbtcBalance)}`);
  console.log(`  Can Airdrop: ${treasury.canAirdrop ? "Yes" : "No"}`);

  console.log(`\nAirdrop Amounts:`);
  console.log(`  Tier A: ${formatSats(config.airdropTierA)}`);
  console.log(`  Tier B: ${formatSats(config.airdropTierB)}`);
  console.log(`  Tier C: ${formatSats(config.airdropTierC)}`);
}

async function cmdSync(): Promise<void> {
  const config = loadConfig();
  const apiUrl = process.env.APPLESEED_API_URL || "https://appleseed-api.c3dar.workers.dev";

  console.log(`\nSyncing to cloud: ${apiUrl}`);

  // Get all prospects from local database
  const prospects = getProspects({ limit: 10000 });
  const stats = getStats();

  console.log(`  Local prospects: ${prospects.length}`);

  if (prospects.length === 0) {
    console.log("  No prospects to sync");
    return;
  }

  // Transform to sync format
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

  try {
    const res = await fetch(`${apiUrl}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncData),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Sync failed: ${res.status} ${text}`);
    }

    const result = await res.json() as { success: boolean; synced: number };
    console.log(`  Synced ${result.synced} prospects to cloud`);
    console.log("\nDashboard: https://appleseed-dashboard.pages.dev");
  } catch (error) {
    console.error("Sync failed:", error);
    process.exit(1);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args._command as string;

  if (!command || args.help) {
    printUsage();
    process.exit(0);
  }

  // Load config
  const config = loadConfig();

  // Initialize database
  initDatabase(config.dbPath);

  try {
    switch (command) {
      case "scan":
        await cmdScan(args);
        break;

      case "qualify":
        await cmdQualify(args);
        break;

      case "outreach":
        await cmdOutreach(args);
        break;

      case "verify":
        await cmdVerify(args);
        break;

      case "airdrop":
        await cmdAirdrop(args);
        break;

      case "status":
        await cmdStatus(args);
        break;

      case "stats":
        await cmdStats();
        break;

      case "treasury":
        await cmdTreasury();
        break;

      case "sync":
        await cmdSync();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    closeDatabase();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
