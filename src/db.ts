import Database, { type Database as DatabaseType } from "better-sqlite3";
import type {
  Prospect,
  ProspectInsert,
  MatchedRepo,
  Tier,
  DiscoveryStrategy,
  OutreachStatus,
  AirdropStatus,
  DailyLimits,
  ActivityLogEntry,
} from "./types";

let db: DatabaseType | null = null;

/**
 * Initialize the SQLite database with schema.
 */
export function initDatabase(dbPath: string): DatabaseType {
  db = new Database(dbPath);

  // Enable foreign keys
  db.exec("PRAGMA foreign_keys = ON");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_username TEXT UNIQUE NOT NULL,
      github_id INTEGER,
      email TEXT,
      repos_json TEXT,

      -- Scoring
      score INTEGER DEFAULT 0,
      tier TEXT CHECK (tier IN ('A', 'B', 'C', 'D')),
      discovered_via TEXT,

      -- Outreach
      outreach_status TEXT DEFAULT 'pending' CHECK (
        outreach_status IN ('pending', 'pr_opened', 'pr_merged', 'pr_closed', 'declined')
      ),
      target_repo TEXT,
      pr_url TEXT,
      pr_number INTEGER,
      pr_opened_at TEXT,

      -- Verification
      stacks_address TEXT,
      address_valid INTEGER DEFAULT 0,
      verified_at TEXT,

      -- Airdrop
      airdrop_status TEXT DEFAULT 'pending' CHECK (
        airdrop_status IN ('pending', 'sent', 'confirmed', 'failed')
      ),
      airdrop_txid TEXT,
      airdrop_amount_sats INTEGER,
      airdrop_sent_at TEXT,

      -- Yield
      yield_enrolled INTEGER DEFAULT 0,
      yield_protocol TEXT,

      -- Metadata
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_limits (
      date TEXT PRIMARY KEY,
      prs_opened INTEGER DEFAULT 0,
      airdrops_sent INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      prospect_id INTEGER,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_prospects_tier ON prospects(tier);
    CREATE INDEX IF NOT EXISTS idx_prospects_outreach_status ON prospects(outreach_status);
    CREATE INDEX IF NOT EXISTS idx_prospects_airdrop_status ON prospects(airdrop_status);
    CREATE INDEX IF NOT EXISTS idx_prospects_stacks_address ON prospects(stacks_address);
    CREATE INDEX IF NOT EXISTS idx_prospects_github_username ON prospects(github_username);
  `);

  return db;
}

/**
 * Get the database instance.
 */
export function getDb(): DatabaseType {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// =============================================================================
// Prospect Operations
// =============================================================================

interface ProspectRow {
  id: number;
  github_username: string;
  github_id: number | null;
  email: string | null;
  repos_json: string | null;
  score: number;
  tier: string | null;
  discovered_via: string | null;
  outreach_status: string;
  target_repo: string | null;
  pr_url: string | null;
  pr_number: number | null;
  pr_opened_at: string | null;
  stacks_address: string | null;
  address_valid: number;
  verified_at: string | null;
  airdrop_status: string;
  airdrop_txid: string | null;
  airdrop_amount_sats: number | null;
  airdrop_sent_at: string | null;
  yield_enrolled: number;
  yield_protocol: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Map database row to Prospect object.
 */
function rowToProspect(row: ProspectRow): Prospect {
  return {
    id: row.id,
    githubUsername: row.github_username,
    githubId: row.github_id,
    email: row.email,
    repos: row.repos_json ? JSON.parse(row.repos_json) : [],

    score: row.score,
    tier: row.tier as Tier | null,
    discoveredVia: row.discovered_via as DiscoveryStrategy | null,

    outreachStatus: row.outreach_status as OutreachStatus,
    targetRepo: row.target_repo,
    prUrl: row.pr_url,
    prNumber: row.pr_number,
    prOpenedAt: row.pr_opened_at,

    stacksAddress: row.stacks_address,
    addressValid: Boolean(row.address_valid),
    verifiedAt: row.verified_at,

    airdropStatus: row.airdrop_status as AirdropStatus,
    airdropTxid: row.airdrop_txid,
    airdropAmountSats: row.airdrop_amount_sats,
    airdropSentAt: row.airdrop_sent_at,

    yieldEnrolled: Boolean(row.yield_enrolled),
    yieldProtocol: row.yield_protocol as "zest" | "hermetica" | null,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Insert a new prospect.
 */
export function insertProspect(data: ProspectInsert): number {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO prospects (github_username, github_id, email, repos_json, score, tier, discovered_via)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.githubUsername,
    data.githubId ?? null,
    data.email ?? null,
    data.repos ? JSON.stringify(data.repos) : null,
    data.score ?? 0,
    data.tier ?? null,
    data.discoveredVia ?? null
  );

  return Number(result.lastInsertRowid);
}

/**
 * Get prospect by ID.
 */
export function getProspectById(id: number): Prospect | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM prospects WHERE id = ?").get(id) as ProspectRow | undefined;
  return row ? rowToProspect(row) : null;
}

/**
 * Get prospect by GitHub username.
 */
export function getProspectByUsername(username: string): Prospect | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM prospects WHERE github_username = ?").get(username) as ProspectRow | undefined;
  return row ? rowToProspect(row) : null;
}

/**
 * Check if username already exists.
 */
export function usernameExists(username: string): boolean {
  const database = getDb();
  const row = database.prepare("SELECT 1 FROM prospects WHERE github_username = ?").get(username);
  return Boolean(row);
}

/**
 * Get all prospects with optional filters.
 */
export function getProspects(filters?: {
  tier?: Tier;
  outreachStatus?: OutreachStatus;
  airdropStatus?: AirdropStatus;
  pendingQualification?: boolean;
  limit?: number;
}): Prospect[] {
  const database = getDb();
  let query = "SELECT * FROM prospects WHERE 1=1";
  const params: (string | number)[] = [];

  if (filters?.tier) {
    query += " AND tier = ?";
    params.push(filters.tier);
  }

  if (filters?.outreachStatus) {
    query += " AND outreach_status = ?";
    params.push(filters.outreachStatus);
  }

  if (filters?.airdropStatus) {
    query += " AND airdrop_status = ?";
    params.push(filters.airdropStatus);
  }

  if (filters?.pendingQualification) {
    query += " AND tier IS NULL";
  }

  query += " ORDER BY created_at DESC";

  if (filters?.limit) {
    query += " LIMIT ?";
    params.push(filters.limit);
  }

  const rows = database.prepare(query).all(...params) as ProspectRow[];
  return rows.map((row) => rowToProspect(row));
}

/**
 * Update prospect scoring.
 */
export function updateProspectScore(
  id: number,
  score: number,
  tier: Tier
): void {
  const database = getDb();
  database.prepare(
    "UPDATE prospects SET score = ?, tier = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(score, tier, id);
}

/**
 * Update prospect repos.
 */
export function updateProspectRepos(id: number, repos: MatchedRepo[]): void {
  const database = getDb();
  database.prepare(
    "UPDATE prospects SET repos_json = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(repos), id);
}

/**
 * Update prospect outreach status.
 */
export function updateProspectOutreach(
  id: number,
  data: {
    outreachStatus: OutreachStatus;
    targetRepo?: string;
    prUrl?: string;
    prNumber?: number;
    prOpenedAt?: string;
  }
): void {
  const database = getDb();
  database.prepare(
    `UPDATE prospects SET
      outreach_status = ?,
      target_repo = COALESCE(?, target_repo),
      pr_url = COALESCE(?, pr_url),
      pr_number = COALESCE(?, pr_number),
      pr_opened_at = COALESCE(?, pr_opened_at),
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(
    data.outreachStatus,
    data.targetRepo ?? null,
    data.prUrl ?? null,
    data.prNumber ?? null,
    data.prOpenedAt ?? null,
    id
  );
}

/**
 * Update prospect verification.
 */
export function updateProspectVerification(
  id: number,
  data: {
    stacksAddress: string;
    addressValid: boolean;
    verifiedAt?: string;
  }
): void {
  const database = getDb();
  database.prepare(
    `UPDATE prospects SET
      stacks_address = ?,
      address_valid = ?,
      verified_at = ?,
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(
    data.stacksAddress,
    data.addressValid ? 1 : 0,
    data.verifiedAt ?? new Date().toISOString(),
    id
  );
}

/**
 * Update prospect airdrop status.
 */
export function updateProspectAirdrop(
  id: number,
  data: {
    airdropStatus: AirdropStatus;
    airdropTxid?: string;
    airdropAmountSats?: number;
    airdropSentAt?: string;
  }
): void {
  const database = getDb();
  database.prepare(
    `UPDATE prospects SET
      airdrop_status = ?,
      airdrop_txid = COALESCE(?, airdrop_txid),
      airdrop_amount_sats = COALESCE(?, airdrop_amount_sats),
      airdrop_sent_at = COALESCE(?, airdrop_sent_at),
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(
    data.airdropStatus,
    data.airdropTxid ?? null,
    data.airdropAmountSats ?? null,
    data.airdropSentAt ?? null,
    id
  );
}

/**
 * Update prospect yield enrollment.
 */
export function updateProspectYield(
  id: number,
  data: {
    yieldEnrolled: boolean;
    yieldProtocol?: "zest" | "hermetica";
  }
): void {
  const database = getDb();
  database.prepare(
    `UPDATE prospects SET
      yield_enrolled = ?,
      yield_protocol = COALESCE(?, yield_protocol),
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(data.yieldEnrolled ? 1 : 0, data.yieldProtocol ?? null, id);
}

// =============================================================================
// Daily Limits
// =============================================================================

/**
 * Get today's date string.
 */
function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

interface DailyLimitsRow {
  date: string;
  prs_opened: number;
  airdrops_sent: number;
}

/**
 * Get or create today's daily limits.
 */
export function getDailyLimits(): DailyLimits {
  const database = getDb();
  const today = getTodayDate();

  let row = database.prepare("SELECT * FROM daily_limits WHERE date = ?").get(today) as DailyLimitsRow | undefined;

  if (!row) {
    database.prepare("INSERT INTO daily_limits (date) VALUES (?)").run(today);
    row = database.prepare("SELECT * FROM daily_limits WHERE date = ?").get(today) as DailyLimitsRow;
  }

  return {
    date: row.date,
    prsOpened: row.prs_opened,
    airdropsSent: row.airdrops_sent,
  };
}

/**
 * Increment PR count for today.
 */
export function incrementDailyPRs(): number {
  const database = getDb();
  const today = getTodayDate();

  // Ensure record exists
  getDailyLimits();

  database.prepare(
    "UPDATE daily_limits SET prs_opened = prs_opened + 1 WHERE date = ?"
  ).run(today);

  const row = database.prepare("SELECT prs_opened FROM daily_limits WHERE date = ?").get(today) as { prs_opened: number };
  return row.prs_opened;
}

/**
 * Increment airdrop count for today.
 */
export function incrementDailyAirdrops(): number {
  const database = getDb();
  const today = getTodayDate();

  // Ensure record exists
  getDailyLimits();

  database.prepare(
    "UPDATE daily_limits SET airdrops_sent = airdrops_sent + 1 WHERE date = ?"
  ).run(today);

  const row = database.prepare("SELECT airdrops_sent FROM daily_limits WHERE date = ?").get(today) as { airdrops_sent: number };
  return row.airdrops_sent;
}

// =============================================================================
// Activity Log
// =============================================================================

interface ActivityLogRow {
  id: number;
  action: string;
  prospect_id: number | null;
  details: string | null;
  created_at: string;
}

/**
 * Log an activity.
 */
export function logActivity(
  action: string,
  prospectId?: number,
  details?: Record<string, unknown>
): void {
  const database = getDb();
  database.prepare(
    "INSERT INTO activity_log (action, prospect_id, details) VALUES (?, ?, ?)"
  ).run(action, prospectId ?? null, details ? JSON.stringify(details) : null);
}

/**
 * Get recent activity log.
 */
export function getActivityLog(limit: number = 50): ActivityLogEntry[] {
  const database = getDb();
  const rows = database.prepare(
    "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?"
  ).all(limit) as ActivityLogRow[];

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    prospectId: row.prospect_id,
    details: row.details ? JSON.parse(row.details) : null,
    createdAt: row.created_at,
  }));
}

// =============================================================================
// Statistics
// =============================================================================

export interface Stats {
  totalProspects: number;
  byTier: { A: number; B: number; C: number; D: number; unqualified: number };
  byOutreachStatus: Record<OutreachStatus, number>;
  byAirdropStatus: Record<AirdropStatus, number>;
  verified: number;
  yieldEnrolled: number;
  todayPRs: number;
  todayAirdrops: number;
}

/**
 * Get overall statistics.
 */
export function getStats(): Stats {
  const database = getDb();

  const total = database.prepare("SELECT COUNT(*) as count FROM prospects").get() as { count: number };

  const tierCounts = database.prepare(`
    SELECT
      COALESCE(tier, 'unqualified') as tier,
      COUNT(*) as count
    FROM prospects
    GROUP BY tier
  `).all() as { tier: string; count: number }[];

  const outreachCounts = database.prepare(`
    SELECT outreach_status, COUNT(*) as count
    FROM prospects
    GROUP BY outreach_status
  `).all() as { outreach_status: string; count: number }[];

  const airdropCounts = database.prepare(`
    SELECT airdrop_status, COUNT(*) as count
    FROM prospects
    GROUP BY airdrop_status
  `).all() as { airdrop_status: string; count: number }[];

  const verified = database.prepare(
    "SELECT COUNT(*) as count FROM prospects WHERE address_valid = 1"
  ).get() as { count: number };

  const yieldEnrolled = database.prepare(
    "SELECT COUNT(*) as count FROM prospects WHERE yield_enrolled = 1"
  ).get() as { count: number };

  const dailyLimits = getDailyLimits();

  return {
    totalProspects: total.count,
    byTier: {
      A: tierCounts.find((t) => t.tier === "A")?.count ?? 0,
      B: tierCounts.find((t) => t.tier === "B")?.count ?? 0,
      C: tierCounts.find((t) => t.tier === "C")?.count ?? 0,
      D: tierCounts.find((t) => t.tier === "D")?.count ?? 0,
      unqualified: tierCounts.find((t) => t.tier === "unqualified")?.count ?? 0,
    },
    byOutreachStatus: {
      pending:
        outreachCounts.find((o) => o.outreach_status === "pending")?.count ?? 0,
      pr_opened:
        outreachCounts.find((o) => o.outreach_status === "pr_opened")?.count ?? 0,
      pr_merged:
        outreachCounts.find((o) => o.outreach_status === "pr_merged")?.count ?? 0,
      pr_closed:
        outreachCounts.find((o) => o.outreach_status === "pr_closed")?.count ?? 0,
      declined:
        outreachCounts.find((o) => o.outreach_status === "declined")?.count ?? 0,
    },
    byAirdropStatus: {
      pending:
        airdropCounts.find((a) => a.airdrop_status === "pending")?.count ?? 0,
      sent:
        airdropCounts.find((a) => a.airdrop_status === "sent")?.count ?? 0,
      confirmed:
        airdropCounts.find((a) => a.airdrop_status === "confirmed")?.count ?? 0,
      failed:
        airdropCounts.find((a) => a.airdrop_status === "failed")?.count ?? 0,
    },
    verified: verified.count,
    yieldEnrolled: yieldEnrolled.count,
    todayPRs: dailyLimits.prsOpened,
    todayAirdrops: dailyLimits.airdropsSent,
  };
}
