/**
 * Qualifier Module
 *
 * Scores and ranks prospects to prioritize high-value targets.
 */

import type {
  Prospect,
  Tier,
  ScoringBreakdown,
  QualificationResult,
  QualifyOptions,
  MatchedRepo,
} from "./types";
import {
  getProspects,
  getProspectById,
  updateProspectScore,
  logActivity,
} from "./db";

// =============================================================================
// Scoring Weights
// =============================================================================

const WEIGHTS = {
  CLAUDE_MCP: 30,    // Max 30 points for Claude/MCP usage
  AI_AGENT: 25,      // Max 25 points for AI agent work
  STARS: 15,         // Max 15 points for repo stars
  ACTIVITY: 15,      // Max 15 points for recent activity
  FOLLOWERS: 10,     // Max 10 points for followers
  CRYPTO: 5,         // Max 5 points for existing crypto work
};

// =============================================================================
// Scoring Functions
// =============================================================================

/**
 * Score Claude/MCP usage (0-30 points).
 */
function scoreClaudeMcp(prospect: Prospect): number {
  const mcpIndicators = [
    "mcp.json",
    "@modelcontextprotocol",
    "claude-mcp",
    "model-context-protocol",
    "anthropic",
  ];

  let score = 0;

  for (const repo of prospect.repos) {
    const query = repo.matchedQuery.toLowerCase();
    const name = repo.name.toLowerCase();
    const desc = (repo.description || "").toLowerCase();

    for (const indicator of mcpIndicators) {
      if (query.includes(indicator) || name.includes(indicator) || desc.includes(indicator)) {
        score = WEIGHTS.CLAUDE_MCP; // Full points for any MCP indicator
        break;
      }
    }
    if (score > 0) break;
  }

  return score;
}

/**
 * Score AI agent work (0-25 points).
 */
function scoreAiAgent(prospect: Prospect): number {
  const agentIndicators = [
    { pattern: "langchain", points: 25 },
    { pattern: "autogpt", points: 25 },
    { pattern: "crewai", points: 25 },
    { pattern: "agent", points: 15 },
    { pattern: "autonomous", points: 10 },
    { pattern: "tool_calling", points: 15 },
    { pattern: "function_call", points: 15 },
  ];

  let maxScore = 0;

  for (const repo of prospect.repos) {
    const query = repo.matchedQuery.toLowerCase();
    const name = repo.name.toLowerCase();
    const desc = (repo.description || "").toLowerCase();
    const combined = `${query} ${name} ${desc}`;

    for (const { pattern, points } of agentIndicators) {
      if (combined.includes(pattern)) {
        maxScore = Math.max(maxScore, points);
      }
    }
  }

  return Math.min(maxScore, WEIGHTS.AI_AGENT);
}

/**
 * Score repository stars (0-15 points).
 * +1 point per 10 stars, max 15 points.
 */
function scoreStars(prospect: Prospect): number {
  const totalStars = prospect.repos.reduce((sum, repo) => sum + repo.stars, 0);
  return Math.min(Math.floor(totalStars / 10), WEIGHTS.STARS);
}

/**
 * Score recent activity (0-15 points).
 * +15 if commit in last 30 days
 * +10 if commit in last 90 days
 * +5 if commit in last 180 days
 */
function scoreActivity(prospect: Prospect): number {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  let mostRecentUpdate: Date | null = null;

  for (const repo of prospect.repos) {
    const updated = new Date(repo.lastUpdated);
    if (!mostRecentUpdate || updated > mostRecentUpdate) {
      mostRecentUpdate = updated;
    }
  }

  if (!mostRecentUpdate) return 0;

  if (mostRecentUpdate >= thirtyDaysAgo) return WEIGHTS.ACTIVITY;
  if (mostRecentUpdate >= ninetyDaysAgo) return 10;
  if (mostRecentUpdate >= oneEightyDaysAgo) return 5;

  return 0;
}

/**
 * Score followers (0-10 points).
 * Based on profile data if available.
 * This is a placeholder - actual followers would come from profile data.
 */
function scoreFollowers(_prospect: Prospect): number {
  // For now, we don't have followers in the prospect record
  // This would need to be enhanced with profile data
  return 0;
}

/**
 * Score crypto/blockchain work (0-5 points).
 */
function scoreCrypto(prospect: Prospect): number {
  const cryptoIndicators = [
    "bitcoin", "btc", "ethereum", "eth", "stacks", "sbtc",
    "web3", "blockchain", "crypto", "defi", "nft",
    "clarity", "solidity", "rust",
  ];

  for (const repo of prospect.repos) {
    const query = repo.matchedQuery.toLowerCase();
    const name = repo.name.toLowerCase();
    const desc = (repo.description || "").toLowerCase();
    const combined = `${query} ${name} ${desc}`;

    for (const indicator of cryptoIndicators) {
      if (combined.includes(indicator)) {
        return WEIGHTS.CRYPTO;
      }
    }
  }

  return 0;
}

/**
 * Generate personalization hooks based on prospect data.
 */
function generatePersonalizationHooks(
  prospect: Prospect,
  breakdown: ScoringBreakdown
): string[] {
  const hooks: string[] = [];

  if (breakdown.claudeMcp > 0) {
    hooks.push("Works with Claude MCP");
  }

  if (breakdown.aiAgent >= 25) {
    // Find which framework
    for (const repo of prospect.repos) {
      const combined = `${repo.matchedQuery} ${repo.name} ${repo.description || ""}`.toLowerCase();
      if (combined.includes("langchain")) {
        hooks.push("LangChain developer");
        break;
      }
      if (combined.includes("crewai")) {
        hooks.push("CrewAI builder");
        break;
      }
      if (combined.includes("autogpt")) {
        hooks.push("AutoGPT contributor");
        break;
      }
    }
  }

  if (breakdown.crypto > 0) {
    hooks.push("Already working in crypto/blockchain");
  }

  if (breakdown.stars >= 10) {
    const totalStars = prospect.repos.reduce((sum, repo) => sum + repo.stars, 0);
    hooks.push(`${totalStars}+ stars on AI projects`);
  }

  // Add top repo mention
  const topRepo = prospect.repos.reduce((best, repo) =>
    repo.stars > (best?.stars ?? 0) ? repo : best
  , prospect.repos[0]);

  if (topRepo) {
    hooks.push(`Built ${topRepo.name}`);
  }

  return hooks;
}

/**
 * Determine tier from score.
 */
function getTier(score: number): Tier {
  if (score >= 70) return "A";
  if (score >= 40) return "B";
  if (score >= 20) return "C";
  return "D";
}

// =============================================================================
// Qualification
// =============================================================================

/**
 * Qualify a single prospect.
 */
export function qualifyProspect(prospect: Prospect): QualificationResult {
  const breakdown: ScoringBreakdown = {
    claudeMcp: scoreClaudeMcp(prospect),
    aiAgent: scoreAiAgent(prospect),
    stars: scoreStars(prospect),
    activity: scoreActivity(prospect),
    followers: scoreFollowers(prospect),
    crypto: scoreCrypto(prospect),
  };

  const score =
    breakdown.claudeMcp +
    breakdown.aiAgent +
    breakdown.stars +
    breakdown.activity +
    breakdown.followers +
    breakdown.crypto;

  const tier = getTier(score);
  const personalizationHooks = generatePersonalizationHooks(prospect, breakdown);

  return { score, tier, breakdown, personalizationHooks };
}

/**
 * Qualify prospects based on options.
 */
export async function qualify(options: QualifyOptions): Promise<{
  qualified: number;
  skipped: number;
  results: Array<{ prospect: Prospect; result: QualificationResult }>;
}> {
  let prospects: Prospect[];

  if (options.prospectId) {
    const prospect = getProspectById(options.prospectId);
    prospects = prospect ? [prospect] : [];
  } else if (options.pending) {
    prospects = getProspects({ pendingQualification: true });
  } else {
    prospects = getProspects();
  }

  console.log(`Qualifying ${prospects.length} prospects...`);

  const results: Array<{ prospect: Prospect; result: QualificationResult }> = [];
  let qualified = 0;
  let skipped = 0;

  for (const prospect of prospects) {
    // Skip if already qualified and not forcing requalification
    if (prospect.tier && !options.prospectId) {
      skipped++;
      continue;
    }

    const result = qualifyProspect(prospect);

    // Apply min tier filter if specified
    if (options.minTier) {
      const tierOrder = { A: 0, B: 1, C: 2, D: 3 };
      if (tierOrder[result.tier] > tierOrder[options.minTier]) {
        skipped++;
        continue;
      }
    }

    // Update database
    updateProspectScore(prospect.id, result.score, result.tier);

    logActivity("qualify:scored", prospect.id, {
      score: result.score,
      tier: result.tier,
      breakdown: result.breakdown,
    });

    results.push({ prospect, result });
    qualified++;

    console.log(
      `  ${prospect.githubUsername}: Score ${result.score} -> Tier ${result.tier}`
    );
  }

  console.log(`\nQualified: ${qualified}, Skipped: ${skipped}`);

  return { qualified, skipped, results };
}

/**
 * Get scoring breakdown explanation.
 */
export function explainBreakdown(breakdown: ScoringBreakdown): string {
  const lines = [
    `  Claude/MCP: ${breakdown.claudeMcp}/${WEIGHTS.CLAUDE_MCP}`,
    `  AI Agent: ${breakdown.aiAgent}/${WEIGHTS.AI_AGENT}`,
    `  Stars: ${breakdown.stars}/${WEIGHTS.STARS}`,
    `  Activity: ${breakdown.activity}/${WEIGHTS.ACTIVITY}`,
    `  Followers: ${breakdown.followers}/${WEIGHTS.FOLLOWERS}`,
    `  Crypto: ${breakdown.crypto}/${WEIGHTS.CRYPTO}`,
  ];
  return lines.join("\n");
}
