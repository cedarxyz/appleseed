/**
 * GitHub API wrapper using gh CLI.
 *
 * Uses the gh CLI for authentication and API calls, which is simpler
 * than managing tokens directly and handles rate limiting transparently.
 */

import { spawn } from "child_process";
import type {
  GitHubSearchResult,
  GitHubSearchItem,
  GitHubUser,
  GitHubPRComment,
  MatchedRepo,
} from "./types";

/**
 * Execute a gh CLI command and return the result.
 */
async function execGh(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn("gh", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on("error", (err) => {
      resolve({ stdout: "", stderr: err.message, exitCode: 1 });
    });
  });
}

/**
 * Execute a gh api command and parse JSON response.
 */
async function ghApi<T>(endpoint: string, options?: {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}): Promise<T> {
  const args = ["api", endpoint];

  if (options?.method) {
    args.push("-X", options.method);
  }

  if (options?.body) {
    args.push("-f", `body=${JSON.stringify(options.body)}`);
  }

  if (options?.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      args.push("-H", `${key}: ${value}`);
    }
  }

  const result = await execGh(args);

  if (result.exitCode !== 0) {
    throw new Error(`gh api failed: ${result.stderr}`);
  }

  return JSON.parse(result.stdout) as T;
}

// =============================================================================
// Search
// =============================================================================

/**
 * Search GitHub repositories.
 */
export async function searchRepos(
  query: string,
  options?: { perPage?: number; page?: number }
): Promise<GitHubSearchResult> {
  const perPage = options?.perPage ?? 30;
  const page = options?.page ?? 1;

  const endpoint = `/search/repositories?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&sort=updated&order=desc`;

  return ghApi<GitHubSearchResult>(endpoint);
}

/**
 * Search GitHub code (for specific file patterns).
 */
export async function searchCode(
  query: string,
  options?: { perPage?: number; page?: number }
): Promise<GitHubSearchResult> {
  const perPage = options?.perPage ?? 30;
  const page = options?.page ?? 1;

  const endpoint = `/search/code?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`;

  return ghApi<GitHubSearchResult>(endpoint);
}

// =============================================================================
// Users
// =============================================================================

/**
 * Get GitHub user profile.
 */
export async function getUser(username: string): Promise<GitHubUser> {
  return ghApi<GitHubUser>(`/users/${username}`);
}

/**
 * Get a user's repositories.
 */
export async function getUserRepos(
  username: string,
  options?: { perPage?: number; sort?: "updated" | "pushed" | "stars" }
): Promise<GitHubSearchItem[]> {
  const perPage = options?.perPage ?? 30;
  const sort = options?.sort ?? "updated";

  return ghApi<GitHubSearchItem[]>(
    `/users/${username}/repos?per_page=${perPage}&sort=${sort}&direction=desc`
  );
}

// =============================================================================
// Repositories
// =============================================================================

/**
 * Get repository info.
 */
export async function getRepo(owner: string, repo: string): Promise<GitHubSearchItem> {
  return ghApi<GitHubSearchItem>(`/repos/${owner}/${repo}`);
}

/**
 * Fork a repository.
 */
export async function forkRepo(
  owner: string,
  repo: string
): Promise<{ full_name: string; html_url: string }> {
  return ghApi<{ full_name: string; html_url: string }>(
    `/repos/${owner}/${repo}/forks`,
    { method: "POST" }
  );
}

/**
 * Create a file in a repository.
 */
export async function createFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string
): Promise<void> {
  const base64Content = Buffer.from(content).toString("base64");

  const result = await execGh([
    "api",
    `/repos/${owner}/${repo}/contents/${path}`,
    "-X", "PUT",
    "-f", `message=${message}`,
    "-f", `content=${base64Content}`,
    "-f", `branch=${branch}`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create file: ${result.stderr}`);
  }
}

/**
 * Create a branch in a repository.
 */
export async function createBranch(
  owner: string,
  repo: string,
  branchName: string,
  fromRef: string = "main"
): Promise<void> {
  // Get the SHA of the source ref
  const refResult = await execGh([
    "api",
    `/repos/${owner}/${repo}/git/ref/heads/${fromRef}`,
  ]);

  if (refResult.exitCode !== 0) {
    // Try 'master' if 'main' doesn't exist
    if (fromRef === "main") {
      return createBranch(owner, repo, branchName, "master");
    }
    throw new Error(`Failed to get ref: ${refResult.stderr}`);
  }

  const refData = JSON.parse(refResult.stdout) as { object: { sha: string } };
  const sha = refData.object.sha;

  // Create the new branch
  const createResult = await execGh([
    "api",
    `/repos/${owner}/${repo}/git/refs`,
    "-X", "POST",
    "-f", `ref=refs/heads/${branchName}`,
    "-f", `sha=${sha}`,
  ]);

  if (createResult.exitCode !== 0) {
    throw new Error(`Failed to create branch: ${createResult.stderr}`);
  }
}

// =============================================================================
// Pull Requests
// =============================================================================

/**
 * Create a pull request.
 */
export async function createPR(
  owner: string,
  repo: string,
  options: {
    title: string;
    body: string;
    head: string; // e.g., "my-fork:feature-branch"
    base: string; // e.g., "main"
  }
): Promise<{ number: number; html_url: string }> {
  const result = await execGh([
    "pr", "create",
    "--repo", `${owner}/${repo}`,
    "--title", options.title,
    "--body", options.body,
    "--head", options.head,
    "--base", options.base,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create PR: ${result.stderr}`);
  }

  // Parse the PR URL from output
  const prUrl = result.stdout.trim();
  const prNumber = parseInt(prUrl.split("/").pop() || "0", 10);

  return { number: prNumber, html_url: prUrl };
}

/**
 * Get PR comments.
 */
export async function getPRComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPRComment[]> {
  return ghApi<GitHubPRComment[]>(
    `/repos/${owner}/${repo}/issues/${prNumber}/comments`
  );
}

/**
 * Post a comment on a PR.
 */
export async function postPRComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<{ id: number; html_url: string }> {
  const result = await execGh([
    "api",
    `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    "-X", "POST",
    "-f", `body=${body}`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to post comment: ${result.stderr}`);
  }

  return JSON.parse(result.stdout) as { id: number; html_url: string };
}

/**
 * Get PR details.
 */
export async function getPR(
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ state: string; merged: boolean }> {
  return ghApi<{ state: string; merged: boolean }>(
    `/repos/${owner}/${repo}/pulls/${prNumber}`
  );
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse owner and repo from a GitHub URL.
 */
export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

/**
 * Parse PR URL to get owner, repo, and PR number.
 */
export function parsePRUrl(url: string): { owner: string; repo: string; prNumber: number } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    prNumber: parseInt(match[3], 10),
  };
}

/**
 * Convert GitHub search item to MatchedRepo.
 */
export function searchItemToMatchedRepo(
  item: GitHubSearchItem,
  matchedQuery: string
): MatchedRepo {
  return {
    name: item.name,
    fullName: item.full_name,
    url: item.html_url,
    stars: item.stargazers_count,
    description: item.description,
    language: item.language,
    lastUpdated: item.updated_at,
    matchedQuery,
  };
}

/**
 * Check if gh CLI is authenticated.
 */
export async function checkAuth(): Promise<boolean> {
  const result = await execGh(["auth", "status"]);
  return result.exitCode === 0;
}

/**
 * Sleep for rate limiting.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
