/**
 * Appleseed v2 Type Definitions
 */

// =============================================================================
// Configuration
// =============================================================================

export interface Config {
  // Wallet
  privateKey: string;
  network: "mainnet" | "testnet";
  facilitatorUrl: string;
  walletAddress: string;

  // CRM
  crmApiUrl: string;

  // Rate limits
  maxDailyPRs: number;
  maxDailyAirdrops: number;

  // Airdrop amounts (in satoshis)
  airdropTierA: number;
  airdropTierB: number;
  airdropTierC: number;

  // Database
  dbPath: string;

  // Links for templates
  calendlyLink: string;
  discordLink: string;
  twitterLink: string;
  websiteLink: string;
  aibtcCliRepo: string;
  appleseedRepoUrl: string;
}

// =============================================================================
// Prospects
// =============================================================================

export type Tier = "A" | "B" | "C" | "D";

export type DiscoveryStrategy =
  | "mcp"
  | "langchain"
  | "autogpt"
  | "crewai"
  | "bitcoin_ai";

export type OutreachStatus =
  | "pending"
  | "pr_opened"
  | "pr_merged"
  | "pr_closed"
  | "declined";

export type AirdropStatus = "pending" | "sent" | "confirmed" | "failed";

export interface MatchedRepo {
  name: string;
  fullName: string;
  url: string;
  stars: number;
  description: string | null;
  language: string | null;
  lastUpdated: string;
  matchedQuery: string;
}

export interface Prospect {
  id: number;
  githubUsername: string;
  githubId: number | null;
  email: string | null;
  repos: MatchedRepo[];

  // Scoring
  score: number;
  tier: Tier | null;
  discoveredVia: DiscoveryStrategy | null;

  // Outreach
  outreachStatus: OutreachStatus;
  targetRepo: string | null;
  prUrl: string | null;
  prNumber: number | null;
  prOpenedAt: string | null;

  // Verification
  stacksAddress: string | null;
  addressValid: boolean;
  verifiedAt: string | null;

  // Airdrop
  airdropStatus: AirdropStatus;
  airdropTxid: string | null;
  airdropAmountSats: number | null;
  airdropSentAt: string | null;

  // Yield
  yieldEnrolled: boolean;
  yieldProtocol: "zest" | "hermetica" | null;

  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface ProspectInsert {
  githubUsername: string;
  githubId?: number;
  email?: string;
  repos?: MatchedRepo[];
  score?: number;
  tier?: Tier;
  discoveredVia?: DiscoveryStrategy;
}

// =============================================================================
// Scanner
// =============================================================================

export interface SearchQuery {
  strategy: DiscoveryStrategy;
  query: string;
}

export interface ScanResult {
  username: string;
  userId: number;
  repos: MatchedRepo[];
  profile: GitHubProfile;
}

export interface GitHubProfile {
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  twitter: string | null;
  blog: string | null;
  email: string | null;
  followers: number;
  publicRepos: number;
  createdAt: string;
}

// =============================================================================
// Qualifier
// =============================================================================

export interface ScoringBreakdown {
  claudeMcp: number; // 0-30
  aiAgent: number; // 0-25
  stars: number; // 0-15
  activity: number; // 0-15
  followers: number; // 0-10
  crypto: number; // 0-5
}

export interface QualificationResult {
  score: number;
  tier: Tier;
  breakdown: ScoringBreakdown;
  personalizationHooks: string[];
}

// =============================================================================
// Outreach
// =============================================================================

export interface OutreachRecord {
  prospectId: number;
  githubUsername: string;
  targetRepo: string;
  prUrl: string | null;
  prNumber: number | null;
  status: "pending" | "delivered" | "failed" | "rate_limited";
  personalizationUsed: string[];
  templateVersion: string;
  createdAt: string;
  deliveredAt: string | null;
  errorMessage: string | null;
}

export interface PRTemplate {
  tier: Tier;
  title: string;
  body: string;
  invitationFileContent: string;
}

// =============================================================================
// Verifier
// =============================================================================

export type VerificationStatus =
  | "awaiting_response"
  | "address_received"
  | "address_invalid"
  | "address_verified"
  | "cli_installed"
  | "yield_enrolled"
  | "declined"
  | "expired";

export interface VerificationResult {
  prospectId: number;
  prUrl: string;
  stacksAddress: string | null;
  isValid: boolean;
  status: VerificationStatus;
  commentUrl: string | null;
}

// =============================================================================
// Airdrop
// =============================================================================

export interface AirdropConfig {
  tierAmounts: {
    A: number;
    B: number;
    C: number;
  };
  treasuryMinBalance: number;
  maxDailyAirdrops: number;
}

export interface AirdropTransaction {
  prospectId: number;
  recipient: string;
  amountSats: number;
  memo: string;
  txid: string | null;
  status: AirdropStatus;
  broadcastAt: string | null;
  confirmedAt: string | null;
  blockHeight: number | null;
}

// =============================================================================
// Database
// =============================================================================

export interface DailyLimits {
  date: string;
  prsOpened: number;
  airdropsSent: number;
}

export interface ActivityLogEntry {
  id: number;
  action: string;
  prospectId: number | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

// =============================================================================
// CLI
// =============================================================================

export interface ScanOptions {
  strategy?: DiscoveryStrategy | "all";
  limit?: number;
  dryRun?: boolean;
  daysSinceActivity?: number;
}

export interface QualifyOptions {
  pending?: boolean;
  prospectId?: number;
  minTier?: Tier;
}

export interface OutreachOptions {
  tier?: Tier;
  limit?: number;
  dryRun?: boolean;
  prospectId?: number;
}

export interface VerifyOptions {
  poll?: boolean;
  interval?: number; // seconds
  prUrl?: string;
}

export interface AirdropOptions {
  pending?: boolean;
  limit?: number;
  prospectId?: number;
  amount?: number;
}

// =============================================================================
// GitHub API
// =============================================================================

export interface GitHubSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubSearchItem[];
}

export interface GitHubSearchItem {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    id: number;
  };
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  pushed_at: string;
  topics: string[];
}

export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  twitter_username: string | null;
  blog: string | null;
  followers: number;
  public_repos: number;
  created_at: string;
}

export interface GitHubPRComment {
  id: number;
  user: {
    login: string;
  };
  body: string;
  created_at: string;
  html_url: string;
}
