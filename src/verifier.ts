/**
 * Verifier Module
 *
 * Monitors PR comments for Stacks addresses and verifies wallet setup.
 */

import type {
  Config,
  Prospect,
  VerifyOptions,
  VerificationResult,
  GitHubPRComment,
} from "./types";
import {
  getPRComments,
  postPRComment,
  parsePRUrl,
  sleep,
} from "./github";
import {
  getProspects,
  getProspectById,
  updateProspectVerification,
  logActivity,
} from "./db";
import { isValidStacksAddress } from "./wallet";
import {
  validAddressComment,
  invalidAddressComment,
} from "./templates/comments";

// =============================================================================
// Constants
// =============================================================================

// Stacks address patterns
const STACKS_ADDRESS_REGEX = /\b(SP|ST)[0-9A-HJ-NP-Z]{38,39}\b/g;

// Verification trigger phrases (case-insensitive)
const VERIFICATION_TRIGGERS = [
  "my address",
  "my wallet",
  "stacks address",
  "ready for airdrop",
  "here's my",
  "here is my",
  "@aibtcdev",
  "sp",
  "st",
];

// Poll interval in seconds
const DEFAULT_POLL_INTERVAL = 300; // 5 minutes

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract Stacks addresses from text.
 */
function extractAddresses(text: string): string[] {
  const matches = text.match(STACKS_ADDRESS_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Check if comment contains verification-related content.
 */
function isVerificationComment(comment: string): boolean {
  const lower = comment.toLowerCase();
  return VERIFICATION_TRIGGERS.some((trigger) => lower.includes(trigger));
}

/**
 * Process a single PR comment looking for addresses.
 */
function processComment(
  comment: GitHubPRComment,
  prospect: Prospect
): { address: string | null; isValid: boolean } {
  // Skip bot comments and comments from PR author
  if (comment.user.login.includes("bot")) {
    return { address: null, isValid: false };
  }

  // Only process comments from the prospect
  if (comment.user.login.toLowerCase() !== prospect.githubUsername.toLowerCase()) {
    return { address: null, isValid: false };
  }

  // Look for addresses in the comment
  const addresses = extractAddresses(comment.body);

  if (addresses.length === 0) {
    // Check if it looks like they're trying to provide an address
    if (isVerificationComment(comment.body)) {
      return { address: null, isValid: false };
    }
    return { address: null, isValid: false };
  }

  // Take the first valid address
  for (const addr of addresses) {
    if (isValidStacksAddress(addr)) {
      return { address: addr, isValid: true };
    }
  }

  // Found address-like strings but none were valid
  return { address: addresses[0], isValid: false };
}

// =============================================================================
// Verification
// =============================================================================

/**
 * Verify a single prospect by checking their PR comments.
 */
async function verifyProspect(
  prospect: Prospect,
  config: Config
): Promise<VerificationResult> {
  const result: VerificationResult = {
    prospectId: prospect.id,
    prUrl: prospect.prUrl || "",
    stacksAddress: null,
    isValid: false,
    status: "awaiting_response",
    commentUrl: null,
  };

  if (!prospect.prUrl) {
    console.log(`  No PR URL for ${prospect.githubUsername}`);
    return result;
  }

  const parsed = parsePRUrl(prospect.prUrl);
  if (!parsed) {
    console.log(`  Invalid PR URL: ${prospect.prUrl}`);
    return result;
  }

  try {
    // Get PR comments
    const comments = await getPRComments(
      parsed.owner,
      parsed.repo,
      parsed.prNumber
    );

    console.log(`  Found ${comments.length} comments`);

    // Process comments looking for addresses
    for (const comment of comments) {
      const { address, isValid } = processComment(comment, prospect);

      if (address) {
        result.stacksAddress = address;
        result.isValid = isValid;
        result.commentUrl = comment.html_url;

        if (isValid) {
          result.status = "address_verified";
          console.log(`  ✓ Valid address found: ${address}`);

          // Update database
          updateProspectVerification(prospect.id, {
            stacksAddress: address,
            addressValid: true,
          });

          // Post confirmation comment
          await postPRComment(
            parsed.owner,
            parsed.repo,
            parsed.prNumber,
            validAddressComment(prospect.githubUsername, address, config)
          );

          logActivity("verify:address_verified", prospect.id, {
            address,
            commentUrl: result.commentUrl,
          });
        } else {
          result.status = "address_invalid";
          console.log(`  ✗ Invalid address: ${address}`);

          // Post correction comment
          await postPRComment(
            parsed.owner,
            parsed.repo,
            parsed.prNumber,
            invalidAddressComment(prospect.githubUsername)
          );

          logActivity("verify:address_invalid", prospect.id, {
            address,
          });
        }

        return result;
      }
    }

    // No address found
    console.log(`  No address found in comments`);

  } catch (error) {
    console.error(`  Error checking PR: ${error}`);
    logActivity("verify:error", prospect.id, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return result;
}

/**
 * Run verification based on options.
 */
export async function verify(
  options: VerifyOptions,
  config: Config
): Promise<{
  verified: number;
  invalid: number;
  pending: number;
  results: VerificationResult[];
}> {
  const { poll = false, interval = DEFAULT_POLL_INTERVAL, prUrl } = options;

  let verified = 0;
  let invalid = 0;
  let pending = 0;
  const results: VerificationResult[] = [];

  const runCheck = async () => {
    // Get prospects with open PRs
    let prospects: Prospect[];

    if (prUrl) {
      // Check specific PR
      const all = getProspects({ outreachStatus: "pr_opened" });
      prospects = all.filter((p) => p.prUrl === prUrl);
    } else {
      // Check all open PRs that aren't verified yet
      prospects = getProspects({ outreachStatus: "pr_opened" }).filter(
        (p) => !p.addressValid && p.prUrl
      );
    }

    console.log(`Checking ${prospects.length} prospects with open PRs...`);

    for (const prospect of prospects) {
      console.log(`\n${prospect.githubUsername}:`);

      const result = await verifyProspect(prospect, config);
      results.push(result);

      if (result.status === "address_verified") {
        verified++;
      } else if (result.status === "address_invalid") {
        invalid++;
      } else {
        pending++;
      }

      // Small delay between checks
      await sleep(1000);
    }

    console.log(`\nResults: ${verified} verified, ${invalid} invalid, ${pending} pending`);
  };

  if (poll) {
    console.log(`Starting poll mode (interval: ${interval}s)`);
    console.log("Press Ctrl+C to stop\n");

    while (true) {
      await runCheck();
      console.log(`\nWaiting ${interval}s until next check...`);
      await sleep(interval * 1000);
    }
  } else {
    await runCheck();
  }

  return { verified, invalid, pending, results };
}

/**
 * Manually verify a specific address for a prospect.
 */
export function manualVerify(
  prospectId: number,
  address: string
): { success: boolean; error?: string } {
  const prospect = getProspectById(prospectId);
  if (!prospect) {
    return { success: false, error: "Prospect not found" };
  }

  if (!isValidStacksAddress(address)) {
    return { success: false, error: "Invalid Stacks address format" };
  }

  updateProspectVerification(prospectId, {
    stacksAddress: address,
    addressValid: true,
  });

  logActivity("verify:manual", prospectId, { address });

  return { success: true };
}
