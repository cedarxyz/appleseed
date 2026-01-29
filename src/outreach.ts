/**
 * Outreach Module
 *
 * Creates personalized GitHub PRs inviting developers to install aibtc-cli.
 */

import type {
  Config,
  Prospect,
  OutreachOptions,
  OutreachRecord,
} from "./types";
import {
  forkRepo,
  createBranch,
  createFile,
  createPR,
  parseRepoUrl,
  checkAuth,
  sleep,
} from "./github";
import {
  getProspects,
  getProspectById,
  updateProspectOutreach,
  getDailyLimits,
  incrementDailyPRs,
  logActivity,
} from "./db";
import { qualifyProspect } from "./qualifier";
import {
  generatePRBody,
  generateInvitationFile,
  PR_TITLE,
  PR_BRANCH,
  INVITATION_FILE_PATH,
} from "./templates/pr-body";

// =============================================================================
// Constants
// =============================================================================

const OUTREACH_DELAY_MS = 5000; // 5 seconds between PRs

// =============================================================================
// Helpers
// =============================================================================

/**
 * Select the best repo for outreach.
 * Prefers: matched repos > recently active > most starred.
 */
function selectTargetRepo(prospect: Prospect): { owner: string; repo: string } | null {
  if (prospect.repos.length === 0) return null;

  // Sort by: matched query relevance, then recency, then stars
  const sorted = [...prospect.repos].sort((a, b) => {
    // Prefer repos that matched our search query
    const aQuery = a.matchedQuery ? 1 : 0;
    const bQuery = b.matchedQuery ? 1 : 0;
    if (aQuery !== bQuery) return bQuery - aQuery;

    // Then by recency
    const aDate = new Date(a.lastUpdated).getTime();
    const bDate = new Date(b.lastUpdated).getTime();
    if (Math.abs(aDate - bDate) > 7 * 24 * 60 * 60 * 1000) {
      return bDate - aDate;
    }

    // Then by stars
    return b.stars - a.stars;
  });

  const best = sorted[0];
  const parsed = parseRepoUrl(best.url);

  if (!parsed) {
    // Try to parse from fullName
    const parts = best.fullName.split("/");
    if (parts.length === 2) {
      return { owner: parts[0], repo: parts[1] };
    }
    return null;
  }

  return parsed;
}

/**
 * Get the authenticated user's username for fork references.
 */
async function getAuthenticatedUser(): Promise<string> {
  const { spawn } = await import("child_process");

  return new Promise((resolve, reject) => {
    const proc = spawn("gh", ["api", "/user", "-q", ".login"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`gh auth failed with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

// =============================================================================
// Outreach
// =============================================================================

/**
 * Send outreach to a single prospect.
 */
async function sendOutreach(
  prospect: Prospect,
  config: Config,
  dryRun: boolean
): Promise<OutreachRecord> {
  const record: OutreachRecord = {
    prospectId: prospect.id,
    githubUsername: prospect.githubUsername,
    targetRepo: "",
    prUrl: null,
    prNumber: null,
    status: "pending",
    personalizationUsed: [],
    templateVersion: "v2.0",
    createdAt: new Date().toISOString(),
    deliveredAt: null,
    errorMessage: null,
  };

  try {
    // Select target repo
    const target = selectTargetRepo(prospect);
    if (!target) {
      record.status = "failed";
      record.errorMessage = "No suitable repository found";
      return record;
    }

    record.targetRepo = `${target.owner}/${target.repo}`;

    // Get qualification for personalization
    const qualification = qualifyProspect(prospect);
    record.personalizationUsed = qualification.personalizationHooks;

    if (dryRun) {
      console.log(`\n[DRY RUN] Would send PR to ${record.targetRepo}`);
      console.log(`  Tier: ${qualification.tier}`);
      console.log(`  Score: ${qualification.score}`);
      console.log(`  Hooks: ${qualification.personalizationHooks.join(", ")}`);
      console.log(`  PR Title: ${PR_TITLE}`);
      console.log(`  Branch: ${PR_BRANCH}`);
      record.status = "pending";
      return record;
    }

    // Get authenticated user for fork
    const authUser = await getAuthenticatedUser();

    // Fork the repository
    console.log(`  Forking ${record.targetRepo}...`);
    await forkRepo(target.owner, target.repo);
    await sleep(3000); // Wait for fork to be ready

    // Create branch in fork
    console.log(`  Creating branch ${PR_BRANCH}...`);
    await createBranch(authUser, target.repo, PR_BRANCH);
    await sleep(1000);

    // Create invitation file
    console.log(`  Adding ${INVITATION_FILE_PATH}...`);
    const invitationContent = generateInvitationFile(config);
    await createFile(
      authUser,
      target.repo,
      INVITATION_FILE_PATH,
      invitationContent,
      "Add AIBTC invitation",
      PR_BRANCH
    );
    await sleep(1000);

    // Create PR
    console.log(`  Opening PR...`);
    const prBody = generatePRBody(prospect, qualification.personalizationHooks, config);
    const pr = await createPR(target.owner, target.repo, {
      title: PR_TITLE,
      body: prBody,
      head: `${authUser}:${PR_BRANCH}`,
      base: "main",
    });

    record.prUrl = pr.html_url;
    record.prNumber = pr.number;
    record.status = "delivered";
    record.deliveredAt = new Date().toISOString();

    // Update database
    updateProspectOutreach(prospect.id, {
      outreachStatus: "pr_opened",
      targetRepo: record.targetRepo,
      prUrl: record.prUrl,
      prNumber: record.prNumber,
      prOpenedAt: record.deliveredAt,
    });

    // Increment daily count
    incrementDailyPRs();

    logActivity("outreach:pr_created", prospect.id, {
      prUrl: record.prUrl,
      tier: qualification.tier,
    });

    console.log(`  ✓ PR created: ${record.prUrl}`);

  } catch (error) {
    record.status = "failed";
    record.errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed: ${record.errorMessage}`);

    logActivity("outreach:failed", prospect.id, {
      error: record.errorMessage,
    });
  }

  return record;
}

/**
 * Run outreach based on options.
 */
export async function outreach(
  options: OutreachOptions,
  config: Config
): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  records: OutreachRecord[];
}> {
  const { tier, limit = 10, dryRun = false, prospectId } = options;

  // Check authentication
  if (!dryRun) {
    const isAuth = await checkAuth();
    if (!isAuth) {
      throw new Error("GitHub CLI not authenticated. Run: gh auth login");
    }
  }

  // Check daily limit
  const dailyLimits = getDailyLimits();
  const remaining = config.maxDailyPRs - dailyLimits.prsOpened;

  if (!dryRun && remaining <= 0) {
    console.log(`Daily PR limit reached (${config.maxDailyPRs}). Try again tomorrow.`);
    return { sent: 0, failed: 0, skipped: 0, records: [] };
  }

  const effectiveLimit = dryRun ? limit : Math.min(limit, remaining);

  // Get prospects
  let prospects: Prospect[];

  if (prospectId) {
    const prospect = getProspectById(prospectId);
    prospects = prospect ? [prospect] : [];
  } else {
    prospects = getProspects({
      tier,
      outreachStatus: "pending",
      limit: effectiveLimit,
    });
  }

  // Filter to qualified prospects (tier A, B, C - skip D)
  prospects = prospects.filter((p) => p.tier && p.tier !== "D");

  console.log(`\nOutreach: ${prospects.length} prospects (limit: ${effectiveLimit})`);
  console.log(`Daily PRs: ${dailyLimits.prsOpened}/${config.maxDailyPRs}`);
  if (dryRun) console.log("[DRY RUN MODE]");

  const records: OutreachRecord[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const prospect of prospects) {
    console.log(`\nProcessing: ${prospect.githubUsername} (Tier ${prospect.tier})`);

    // Skip if already contacted
    if (prospect.outreachStatus !== "pending") {
      console.log(`  Skipping: already ${prospect.outreachStatus}`);
      skipped++;
      continue;
    }

    const record = await sendOutreach(prospect, config, dryRun);
    records.push(record);

    if (record.status === "delivered") {
      sent++;
    } else if (record.status === "failed") {
      failed++;
    }

    if (!dryRun) {
      await sleep(OUTREACH_DELAY_MS);
    }
  }

  console.log(`\nOutreach complete: ${sent} sent, ${failed} failed, ${skipped} skipped`);

  return { sent, failed, skipped, records };
}
