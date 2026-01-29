/**
 * Scanner Module
 *
 * Discovers AI/agent builders on GitHub using multiple search strategies.
 */

import type {
  DiscoveryStrategy,
  ScanResult,
  ScanOptions,
  MatchedRepo,
  GitHubProfile,
} from "./types";
import {
  searchRepos,
  getUser,
  searchItemToMatchedRepo,
  sleep,
} from "./github";
import {
  insertProspect,
  usernameExists,
  logActivity,
} from "./db";

// =============================================================================
// Search Strategies
// =============================================================================

const SEARCH_QUERIES: Record<DiscoveryStrategy, string[]> = {
  mcp: [
    "filename:mcp.json",
    '"@modelcontextprotocol" in:file',
    "topic:claude-mcp",
    "topic:model-context-protocol",
    '"claude" "mcp" language:TypeScript',
    '"anthropic" filename:mcp.json',
  ],
  langchain: [
    '"langchain" in:file language:python stars:>10',
    '"langchain" in:file language:typescript stars:>10',
    "topic:langchain stars:>10",
    '"from langchain" language:python stars:>20',
  ],
  autogpt: [
    "topic:autogpt",
    "auto-gpt in:name",
    '"autogpt" language:python stars:>50',
  ],
  crewai: [
    '"crewai" in:file language:python',
    "topic:crewai",
    "filename:crew.yaml",
    '"from crewai" language:python',
  ],
  bitcoin_ai: [
    "topic:bitcoin topic:ai",
    "topic:btc topic:agent",
    '"sbtc" "agent" in:readme',
    '"stacks" "AI" in:readme',
    '"bitcoin" "agent" language:python stars:>10',
  ],
};

// Rate limit: 30 search requests per minute for authenticated users
const SEARCH_DELAY_MS = 2100; // ~28 requests/minute to be safe

// =============================================================================
// Scanner
// =============================================================================

/**
 * Run a single search query and collect unique users.
 */
async function runSearchQuery(
  query: string,
  strategy: DiscoveryStrategy,
  seenUsers: Set<string>,
  limit: number
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  try {
    const searchResults = await searchRepos(query, { perPage: 30 });

    for (const item of searchResults.items) {
      const username = item.owner.login;

      // Skip if we've already seen this user
      if (seenUsers.has(username)) continue;
      seenUsers.add(username);

      // Skip if already in database
      if (usernameExists(username)) {
        continue;
      }

      // Get user profile
      await sleep(500); // Small delay for user API
      const profile = await getUser(username);

      const matchedRepo = searchItemToMatchedRepo(item, query);

      results.push({
        username,
        userId: item.owner.id,
        repos: [matchedRepo],
        profile: {
          name: profile.name,
          bio: profile.bio,
          company: profile.company,
          location: profile.location,
          twitter: profile.twitter_username,
          blog: profile.blog,
          email: profile.email,
          followers: profile.followers,
          publicRepos: profile.public_repos,
          createdAt: profile.created_at,
        },
      });

      if (results.length >= limit) break;
    }
  } catch (error) {
    console.error(`Search query failed: ${query}`, error);
  }

  return results;
}

/**
 * Merge repos for the same user.
 */
function mergeResults(results: ScanResult[]): ScanResult[] {
  const byUser = new Map<string, ScanResult>();

  for (const result of results) {
    const existing = byUser.get(result.username);
    if (existing) {
      // Merge repos
      existing.repos = [...existing.repos, ...result.repos];
    } else {
      byUser.set(result.username, result);
    }
  }

  return Array.from(byUser.values());
}

/**
 * Filter results by activity recency.
 */
function filterByActivity(
  results: ScanResult[],
  daysSinceActivity: number
): ScanResult[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysSinceActivity);

  return results.filter((result) => {
    // Check if any repo has been updated recently
    return result.repos.some((repo) => {
      const updated = new Date(repo.lastUpdated);
      return updated >= cutoff;
    });
  });
}

/**
 * Check if account is old enough (6 months).
 */
function isAccountOldEnough(profile: GitHubProfile): boolean {
  const createdAt = new Date(profile.createdAt);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return createdAt <= sixMonthsAgo;
}

/**
 * Scan for prospects using specified strategy.
 */
export async function scan(options: ScanOptions): Promise<ScanResult[]> {
  const {
    strategy = "all",
    limit = 50,
    dryRun = false,
    daysSinceActivity = 90,
  } = options;

  const seenUsers = new Set<string>();
  let allResults: ScanResult[] = [];

  // Determine which strategies to use
  const strategies: DiscoveryStrategy[] =
    strategy === "all"
      ? (["mcp", "langchain", "autogpt", "crewai", "bitcoin_ai"] as DiscoveryStrategy[])
      : [strategy as DiscoveryStrategy];

  console.log(`Scanning with strategies: ${strategies.join(", ")}`);
  console.log(`Limit: ${limit}, Days since activity: ${daysSinceActivity}`);

  for (const strat of strategies) {
    const queries = SEARCH_QUERIES[strat];
    console.log(`\nStrategy: ${strat} (${queries.length} queries)`);

    for (const query of queries) {
      if (allResults.length >= limit) break;

      console.log(`  Searching: ${query.substring(0, 50)}...`);

      const results = await runSearchQuery(
        query,
        strat,
        seenUsers,
        limit - allResults.length
      );

      // Add strategy info
      for (const result of results) {
        (result as ScanResult & { strategy: DiscoveryStrategy }).strategy = strat;
      }

      allResults = [...allResults, ...results];
      console.log(`    Found ${results.length} new prospects`);

      await sleep(SEARCH_DELAY_MS);
    }
  }

  // Merge results for same users
  allResults = mergeResults(allResults);

  // Filter by activity
  allResults = filterByActivity(allResults, daysSinceActivity);

  // Filter by account age
  allResults = allResults.filter((r) => isAccountOldEnough(r.profile));

  console.log(`\nTotal unique prospects after filtering: ${allResults.length}`);

  // Save to database unless dry run
  if (!dryRun) {
    let saved = 0;
    for (const result of allResults) {
      try {
        const strat = (result as ScanResult & { strategy?: DiscoveryStrategy }).strategy;
        insertProspect({
          githubUsername: result.username,
          githubId: result.userId,
          email: result.profile.email ?? undefined,
          repos: result.repos,
          discoveredVia: strat,
        });
        logActivity("scan:prospect_added", undefined, {
          username: result.username,
          strategy: strat,
          repoCount: result.repos.length,
        });
        saved++;
      } catch (error) {
        // Likely duplicate username
        console.error(`Failed to save ${result.username}:`, error);
      }
    }
    console.log(`Saved ${saved} prospects to database`);
  } else {
    console.log("Dry run - no prospects saved");
  }

  return allResults;
}

/**
 * Get search queries for a strategy (for testing).
 */
export function getSearchQueries(strategy: DiscoveryStrategy): string[] {
  return SEARCH_QUERIES[strategy] ?? [];
}

/**
 * List all available strategies.
 */
export function listStrategies(): DiscoveryStrategy[] {
  return Object.keys(SEARCH_QUERIES) as DiscoveryStrategy[];
}
