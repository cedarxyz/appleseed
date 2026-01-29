-- Appleseed D1 Schema

CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_username TEXT UNIQUE NOT NULL,
  github_id INTEGER,
  email TEXT,
  repos_json TEXT,
  score INTEGER DEFAULT 0,
  tier TEXT CHECK (tier IN ('A','B','C','D')),
  discovered_via TEXT,
  outreach_status TEXT DEFAULT 'pending',
  target_repo TEXT,
  pr_url TEXT,
  pr_number INTEGER,
  pr_opened_at TEXT,
  stacks_address TEXT,
  address_valid INTEGER DEFAULT 0,
  verified_at TEXT,
  airdrop_status TEXT DEFAULT 'pending',
  airdrop_txid TEXT,
  airdrop_amount_sats INTEGER,
  airdrop_sent_at TEXT,
  yield_enrolled INTEGER DEFAULT 0,
  yield_protocol TEXT,
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

CREATE INDEX IF NOT EXISTS idx_prospects_tier ON prospects(tier);
CREATE INDEX IF NOT EXISTS idx_prospects_outreach ON prospects(outreach_status);
CREATE INDEX IF NOT EXISTS idx_prospects_airdrop ON prospects(airdrop_status);
