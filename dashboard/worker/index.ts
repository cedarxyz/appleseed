/**
 * Appleseed API Worker
 * Serves stats from D1 database
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for dashboard
app.use("*", cors({
  origin: ["https://appleseed-dashboard.pages.dev", "http://localhost:3000"],
  allowMethods: ["GET", "POST", "OPTIONS"],
}));

// Health check
app.get("/", (c) => c.json({ status: "ok", service: "appleseed-api" }));

// Get stats
app.get("/api/stats", async (c) => {
  const db = c.env.DB;

  try {
    // Get total counts
    const total = await db.prepare("SELECT COUNT(*) as count FROM prospects").first<{ count: number }>();

    // Get tier counts
    const tierCounts = await db.prepare(`
      SELECT COALESCE(tier, 'unqualified') as tier, COUNT(*) as count
      FROM prospects GROUP BY tier
    `).all<{ tier: string; count: number }>();

    // Get outreach status counts
    const outreachCounts = await db.prepare(`
      SELECT outreach_status, COUNT(*) as count
      FROM prospects GROUP BY outreach_status
    `).all<{ outreach_status: string; count: number }>();

    // Get airdrop status counts
    const airdropCounts = await db.prepare(`
      SELECT airdrop_status, COUNT(*) as count
      FROM prospects GROUP BY airdrop_status
    `).all<{ airdrop_status: string; count: number }>();

    // Get verified count
    const verified = await db.prepare(
      "SELECT COUNT(*) as count FROM prospects WHERE address_valid = 1"
    ).first<{ count: number }>();

    // Get yield enrolled count
    const yieldEnrolled = await db.prepare(
      "SELECT COUNT(*) as count FROM prospects WHERE yield_enrolled = 1"
    ).first<{ count: number }>();

    // Get today's date
    const today = new Date().toISOString().split("T")[0];

    // Get daily limits
    const dailyLimits = await db.prepare(
      "SELECT * FROM daily_limits WHERE date = ?"
    ).bind(today).first<{ prs_opened: number; airdrops_sent: number }>();

    // Get top prospects
    const topProspects = await db.prepare(`
      SELECT id, github_username, tier, score, outreach_status, airdrop_status, stacks_address, address_valid
      FROM prospects
      WHERE tier IS NOT NULL AND tier != 'D'
      ORDER BY score DESC
      LIMIT 10
    `).all<{
      id: number;
      github_username: string;
      tier: string;
      score: number;
      outreach_status: string;
      airdrop_status: string;
      address_valid: number;
    }>();

    // Get recent prospects
    const recentProspects = await db.prepare(`
      SELECT id, github_username, tier, score, outreach_status, airdrop_status, stacks_address, address_valid, created_at
      FROM prospects
      ORDER BY created_at DESC
      LIMIT 20
    `).all<{
      id: number;
      github_username: string;
      tier: string;
      score: number;
      outreach_status: string;
      airdrop_status: string;
      address_valid: number;
      created_at: string;
    }>();

    const tiers = tierCounts.results || [];
    const outreach = outreachCounts.results || [];
    const airdrops = airdropCounts.results || [];

    const stats = {
      totalProspects: total?.count ?? 0,
      byTier: {
        A: tiers.find((t) => t.tier === "A")?.count ?? 0,
        B: tiers.find((t) => t.tier === "B")?.count ?? 0,
        C: tiers.find((t) => t.tier === "C")?.count ?? 0,
        D: tiers.find((t) => t.tier === "D")?.count ?? 0,
        unqualified: tiers.find((t) => t.tier === "unqualified")?.count ?? 0,
      },
      byOutreachStatus: {
        pending: outreach.find((o) => o.outreach_status === "pending")?.count ?? 0,
        pr_opened: outreach.find((o) => o.outreach_status === "pr_opened")?.count ?? 0,
        pr_merged: outreach.find((o) => o.outreach_status === "pr_merged")?.count ?? 0,
        pr_closed: outreach.find((o) => o.outreach_status === "pr_closed")?.count ?? 0,
        declined: outreach.find((o) => o.outreach_status === "declined")?.count ?? 0,
      },
      byAirdropStatus: {
        pending: airdrops.find((a) => a.airdrop_status === "pending")?.count ?? 0,
        sent: airdrops.find((a) => a.airdrop_status === "sent")?.count ?? 0,
        confirmed: airdrops.find((a) => a.airdrop_status === "confirmed")?.count ?? 0,
        failed: airdrops.find((a) => a.airdrop_status === "failed")?.count ?? 0,
      },
      verified: verified?.count ?? 0,
      yieldEnrolled: yieldEnrolled?.count ?? 0,
      todayPRs: dailyLimits?.prs_opened ?? 0,
      todayAirdrops: dailyLimits?.airdrops_sent ?? 0,
      topProspects: (topProspects.results || []).map((p) => ({
        id: p.id,
        username: p.github_username,
        tier: p.tier,
        score: p.score,
        outreachStatus: p.outreach_status,
        airdropStatus: p.airdrop_status,
        verified: Boolean(p.address_valid),
      })),
      recentProspects: (recentProspects.results || []).map((p) => ({
        id: p.id,
        username: p.github_username,
        tier: p.tier,
        score: p.score,
        outreachStatus: p.outreach_status,
        airdropStatus: p.airdrop_status,
        verified: Boolean(p.address_valid),
        createdAt: p.created_at,
      })),
    };

    return c.json(stats);
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return c.json({
      error: "Failed to fetch stats",
      totalProspects: 0,
      byTier: { A: 0, B: 0, C: 0, D: 0, unqualified: 0 },
      byOutreachStatus: { pending: 0, pr_opened: 0, pr_merged: 0, pr_closed: 0, declined: 0 },
      byAirdropStatus: { pending: 0, sent: 0, confirmed: 0, failed: 0 },
      verified: 0,
      yieldEnrolled: 0,
      todayPRs: 0,
      todayAirdrops: 0,
      topProspects: [],
      recentProspects: [],
    }, 500);
  }
});

// List all prospects with filtering, sorting, pagination
app.get("/api/prospects", async (c) => {
  const db = c.env.DB;

  try {
    const { tier, outreach, airdrop, search, sort, order, limit, offset } = c.req.query();

    let query = "SELECT * FROM prospects WHERE 1=1";
    const params: (string | number)[] = [];

    // Filters
    if (tier) {
      query += " AND tier = ?";
      params.push(tier);
    }
    if (outreach) {
      query += " AND outreach_status = ?";
      params.push(outreach);
    }
    if (airdrop) {
      query += " AND airdrop_status = ?";
      params.push(airdrop);
    }
    if (search) {
      query += " AND github_username LIKE ?";
      params.push(`%${search}%`);
    }

    // Sorting
    const sortColumn = sort || "score";
    const sortOrder = order === "asc" ? "ASC" : "DESC";
    const allowedColumns = ["score", "tier", "github_username", "outreach_status", "airdrop_status", "created_at"];
    if (allowedColumns.includes(sortColumn)) {
      query += ` ORDER BY ${sortColumn} ${sortOrder}`;
    } else {
      query += " ORDER BY score DESC";
    }

    // Pagination
    const limitNum = Math.min(parseInt(limit || "50", 10), 500);
    const offsetNum = parseInt(offset || "0", 10);
    query += " LIMIT ? OFFSET ?";
    params.push(limitNum, offsetNum);

    const results = await db.prepare(query).bind(...params).all();

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) as count FROM prospects WHERE 1=1";
    const countParams: (string | number)[] = [];
    if (tier) {
      countQuery += " AND tier = ?";
      countParams.push(tier);
    }
    if (outreach) {
      countQuery += " AND outreach_status = ?";
      countParams.push(outreach);
    }
    if (airdrop) {
      countQuery += " AND airdrop_status = ?";
      countParams.push(airdrop);
    }
    if (search) {
      countQuery += " AND github_username LIKE ?";
      countParams.push(`%${search}%`);
    }

    const totalResult = await db.prepare(countQuery).bind(...countParams).first<{ count: number }>();

    return c.json({
      prospects: (results.results || []).map((p: Record<string, unknown>) => ({
        id: p.id,
        username: p.github_username,
        githubId: p.github_id,
        email: p.email,
        repos: p.repos_json ? JSON.parse(p.repos_json as string) : [],
        score: p.score,
        tier: p.tier,
        discoveredVia: p.discovered_via,
        outreachStatus: p.outreach_status,
        targetRepo: p.target_repo,
        prUrl: p.pr_url,
        prNumber: p.pr_number,
        stacksAddress: p.stacks_address,
        verified: Boolean(p.address_valid),
        airdropStatus: p.airdrop_status,
        airdropTxid: p.airdrop_txid,
        airdropAmountSats: p.airdrop_amount_sats,
        yieldEnrolled: Boolean(p.yield_enrolled),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
      total: totalResult?.count ?? 0,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error("Failed to fetch prospects:", error);
    return c.json({ error: "Failed to fetch prospects", prospects: [], total: 0 }, 500);
  }
});

// Get single prospect by ID
app.get("/api/prospects/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");

  try {
    const result = await db.prepare("SELECT * FROM prospects WHERE id = ?").bind(id).first();

    if (!result) {
      return c.json({ error: "Prospect not found" }, 404);
    }

    const p = result as Record<string, unknown>;
    return c.json({
      id: p.id,
      username: p.github_username,
      githubId: p.github_id,
      email: p.email,
      repos: p.repos_json ? JSON.parse(p.repos_json as string) : [],
      score: p.score,
      tier: p.tier,
      discoveredVia: p.discovered_via,
      outreachStatus: p.outreach_status,
      targetRepo: p.target_repo,
      prUrl: p.pr_url,
      prNumber: p.pr_number,
      prOpenedAt: p.pr_opened_at,
      stacksAddress: p.stacks_address,
      verified: Boolean(p.address_valid),
      verifiedAt: p.verified_at,
      airdropStatus: p.airdrop_status,
      airdropTxid: p.airdrop_txid,
      airdropAmountSats: p.airdrop_amount_sats,
      airdropSentAt: p.airdrop_sent_at,
      yieldEnrolled: Boolean(p.yield_enrolled),
      yieldProtocol: p.yield_protocol,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    });
  } catch (error) {
    console.error("Failed to fetch prospect:", error);
    return c.json({ error: "Failed to fetch prospect" }, 500);
  }
});

// Get airdrops feed
app.get("/api/airdrops", async (c) => {
  const db = c.env.DB;

  try {
    const { limit, offset } = c.req.query();
    const limitNum = Math.min(parseInt(limit || "100", 10), 500);
    const offsetNum = parseInt(offset || "0", 10);

    // Get airdrops that have been sent or confirmed
    const results = await db.prepare(`
      SELECT id, github_username, github_id, stacks_address, airdrop_status,
             airdrop_txid, airdrop_amount_sats, airdrop_sent_at
      FROM prospects
      WHERE airdrop_status IN ('sent', 'confirmed')
      ORDER BY airdrop_sent_at DESC
      LIMIT ? OFFSET ?
    `).bind(limitNum, offsetNum).all();

    // Get totals
    const totals = await db.prepare(`
      SELECT
        COUNT(*) as count,
        SUM(airdrop_amount_sats) as total_sats
      FROM prospects
      WHERE airdrop_status IN ('sent', 'confirmed')
    `).first<{ count: number; total_sats: number }>();

    return c.json({
      airdrops: (results.results || []).map((a: Record<string, unknown>) => ({
        id: a.id,
        username: a.github_username,
        githubId: a.github_id,
        stacksAddress: a.stacks_address,
        status: a.airdrop_status,
        txid: a.airdrop_txid,
        amountSats: a.airdrop_amount_sats,
        sentAt: a.airdrop_sent_at,
      })),
      totalCount: totals?.count ?? 0,
      totalSats: totals?.total_sats ?? 0,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error("Failed to fetch airdrops:", error);
    return c.json({ error: "Failed to fetch airdrops", airdrops: [], totalCount: 0, totalSats: 0 }, 500);
  }
});

// Treasury endpoint - fetches live balance from Stacks API
app.get("/api/treasury", async (c) => {
  const db = c.env.DB;
  const TREASURY_ADDRESS = "SP1YDWNBQ83KZS18VRV5Y1WJPREJPMHTZR6CGG522";
  const SBTC_CONTRACT = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";

  try {
    // Fetch sBTC balance from Stacks API
    const balanceRes = await fetch(
      `https://api.mainnet.hiro.so/extended/v1/address/${TREASURY_ADDRESS}/balances`
    );
    const balanceData = await balanceRes.json() as {
      stx: { balance: string };
      fungible_tokens: Record<string, { balance: string }>;
    };

    const stxBalance = parseInt(balanceData.stx?.balance || "0", 10);
    const sbtcBalance = parseInt(
      balanceData.fungible_tokens?.[`${SBTC_CONTRACT}::sbtc-token`]?.balance || "0",
      10
    );

    // Get pending airdrop obligations
    const pending = await db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(
        CASE tier
          WHEN 'A' THEN 10000
          WHEN 'B' THEN 5000
          WHEN 'C' THEN 2500
          ELSE 0
        END
      ), 0) as total_sats
      FROM prospects
      WHERE address_valid = 1 AND airdrop_status = 'pending'
    `).first<{ count: number; total_sats: number }>();

    // Get total airdropped
    const airdropped = await db.prepare(`
      SELECT COALESCE(SUM(airdrop_amount_sats), 0) as total
      FROM prospects
      WHERE airdrop_status IN ('sent', 'confirmed')
    `).first<{ total: number }>();

    // Get recent transactions from Stacks API
    const txRes = await fetch(
      `https://api.mainnet.hiro.so/extended/v1/address/${TREASURY_ADDRESS}/transactions?limit=10`
    );
    const txData = await txRes.json() as {
      results: Array<{
        tx_id: string;
        tx_type: string;
        tx_status: string;
        block_time: number;
        sender_address: string;
        token_transfer?: { amount: string; recipient_address: string };
      }>;
    };

    const transactions = (txData.results || []).map((tx) => ({
      txid: tx.tx_id,
      type: tx.tx_type,
      status: tx.tx_status,
      timestamp: tx.block_time ? new Date(tx.block_time * 1000).toISOString() : null,
      sender: tx.sender_address,
      amount: tx.token_transfer?.amount,
      recipient: tx.token_transfer?.recipient_address,
    }));

    return c.json({
      address: TREASURY_ADDRESS,
      stxBalance,
      sbtcBalance,
      pendingAirdrops: pending?.count ?? 0,
      pendingObligationSats: pending?.total_sats ?? 0,
      totalAirdroppedSats: airdropped?.total ?? 0,
      transactions,
      lowBalanceAlert: sbtcBalance < (pending?.total_sats ?? 0),
    });
  } catch (error) {
    console.error("Failed to fetch treasury:", error);
    return c.json({ error: "Failed to fetch treasury data" }, 500);
  }
});

// Activity log endpoint
app.get("/api/activity", async (c) => {
  const db = c.env.DB;

  try {
    const { limit, offset } = c.req.query();
    const limitNum = Math.min(parseInt(limit || "50", 10), 200);
    const offsetNum = parseInt(offset || "0", 10);

    const results = await db.prepare(`
      SELECT * FROM activity_log
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limitNum, offsetNum).all();

    const total = await db.prepare("SELECT COUNT(*) as count FROM activity_log").first<{ count: number }>();

    return c.json({
      activities: (results.results || []).map((a: Record<string, unknown>) => ({
        id: a.id,
        action: a.action,
        prospectId: a.prospect_id,
        details: a.details ? JSON.parse(a.details as string) : null,
        createdAt: a.created_at,
      })),
      total: total?.count ?? 0,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error("Failed to fetch activity:", error);
    return c.json({ activities: [], total: 0, error: "Failed to fetch activity" }, 500);
  }
});

// Analytics endpoint - time series data
app.get("/api/analytics", async (c) => {
  const db = c.env.DB;

  try {
    // Get prospects by day (last 30 days)
    const prospectsByDay = await db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM prospects
      WHERE created_at >= DATE('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all<{ date: string; count: number }>();

    // Get airdrops by day
    const airdropsByDay = await db.prepare(`
      SELECT DATE(airdrop_sent_at) as date, COUNT(*) as count, SUM(airdrop_amount_sats) as total_sats
      FROM prospects
      WHERE airdrop_sent_at IS NOT NULL AND airdrop_sent_at >= DATE('now', '-30 days')
      GROUP BY DATE(airdrop_sent_at)
      ORDER BY date ASC
    `).all<{ date: string; count: number; total_sats: number }>();

    // Get daily limits history
    const dailyLimits = await db.prepare(`
      SELECT * FROM daily_limits
      ORDER BY date DESC
      LIMIT 30
    `).all<{ date: string; prs_opened: number; airdrops_sent: number }>();

    // Get conversion funnel
    const funnel = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN tier IS NOT NULL AND tier != 'D' THEN 1 ELSE 0 END) as qualified,
        SUM(CASE WHEN outreach_status IN ('pr_opened', 'pr_merged', 'pr_closed') THEN 1 ELSE 0 END) as contacted,
        SUM(CASE WHEN address_valid = 1 THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN airdrop_status IN ('sent', 'confirmed') THEN 1 ELSE 0 END) as airdropped
      FROM prospects
    `).first<{ total: number; qualified: number; contacted: number; verified: number; airdropped: number }>();

    // Get tier distribution
    const tierDist = await db.prepare(`
      SELECT tier, COUNT(*) as count
      FROM prospects
      WHERE tier IS NOT NULL
      GROUP BY tier
    `).all<{ tier: string; count: number }>();

    return c.json({
      prospectsByDay: prospectsByDay.results || [],
      airdropsByDay: airdropsByDay.results || [],
      dailyLimits: dailyLimits.results || [],
      funnel: funnel || { total: 0, qualified: 0, contacted: 0, verified: 0, airdropped: 0 },
      tierDistribution: tierDist.results || [],
    });
  } catch (error) {
    console.error("Failed to fetch analytics:", error);
    return c.json({ error: "Failed to fetch analytics" }, 500);
  }
});

// PR tracking endpoint
app.get("/api/prs", async (c) => {
  const db = c.env.DB;

  try {
    const { status } = c.req.query();

    let query = `
      SELECT id, github_username, github_id, tier, score, target_repo, pr_url, pr_number,
             pr_opened_at, outreach_status, stacks_address, address_valid
      FROM prospects
      WHERE pr_url IS NOT NULL
    `;

    if (status === "open") {
      query += " AND outreach_status = 'pr_opened'";
    } else if (status === "merged") {
      query += " AND outreach_status = 'pr_merged'";
    } else if (status === "closed") {
      query += " AND outreach_status IN ('pr_closed', 'declined')";
    }

    query += " ORDER BY pr_opened_at DESC";

    const results = await db.prepare(query).all();

    // Calculate stats
    const stats = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN outreach_status = 'pr_opened' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN outreach_status = 'pr_merged' THEN 1 ELSE 0 END) as merged,
        SUM(CASE WHEN outreach_status IN ('pr_closed', 'declined') THEN 1 ELSE 0 END) as closed
      FROM prospects
      WHERE pr_url IS NOT NULL
    `).first<{ total: number; open: number; merged: number; closed: number }>();

    return c.json({
      prs: (results.results || []).map((p: Record<string, unknown>) => ({
        id: p.id,
        username: p.github_username,
        githubId: p.github_id,
        tier: p.tier,
        score: p.score,
        targetRepo: p.target_repo,
        prUrl: p.pr_url,
        prNumber: p.pr_number,
        prOpenedAt: p.pr_opened_at,
        status: p.outreach_status,
        hasAddress: Boolean(p.stacks_address),
        verified: Boolean(p.address_valid),
      })),
      stats: stats || { total: 0, open: 0, merged: 0, closed: 0 },
    });
  } catch (error) {
    console.error("Failed to fetch PRs:", error);
    return c.json({ error: "Failed to fetch PRs", prs: [], stats: { total: 0, open: 0, merged: 0, closed: 0 } }, 500);
  }
});

// Global search endpoint
app.get("/api/search", async (c) => {
  const db = c.env.DB;

  try {
    const { q, limit } = c.req.query();
    if (!q || q.length < 2) {
      return c.json({ results: [] });
    }

    const limitNum = Math.min(parseInt(limit || "10", 10), 50);

    const results = await db.prepare(`
      SELECT id, github_username, github_id, tier, score, outreach_status, airdrop_status
      FROM prospects
      WHERE github_username LIKE ?
      ORDER BY score DESC
      LIMIT ?
    `).bind(`%${q}%`, limitNum).all();

    return c.json({
      results: (results.results || []).map((p: Record<string, unknown>) => ({
        id: p.id,
        username: p.github_username,
        githubId: p.github_id,
        tier: p.tier,
        score: p.score,
        outreachStatus: p.outreach_status,
        airdropStatus: p.airdrop_status,
      })),
    });
  } catch (error) {
    console.error("Search failed:", error);
    return c.json({ results: [], error: "Search failed" }, 500);
  }
});

// Update prospect notes/tags
app.post("/api/prospects/:id/notes", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");

  try {
    const body = await c.req.json<{ notes?: string; tags?: string[] }>();

    await db.prepare(`
      UPDATE prospects
      SET notes = ?, tags = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(body.notes || null, body.tags ? JSON.stringify(body.tags) : null, id).run();

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to update notes:", error);
    return c.json({ error: "Failed to update notes" }, 500);
  }
});

// Export prospects as CSV
app.get("/api/prospects/export", async (c) => {
  const db = c.env.DB;

  try {
    const { tier, outreach, airdrop } = c.req.query();

    let query = "SELECT * FROM prospects WHERE 1=1";
    const params: string[] = [];

    if (tier) {
      query += " AND tier = ?";
      params.push(tier);
    }
    if (outreach) {
      query += " AND outreach_status = ?";
      params.push(outreach);
    }
    if (airdrop) {
      query += " AND airdrop_status = ?";
      params.push(airdrop);
    }

    query += " ORDER BY score DESC";

    const results = await db.prepare(query).bind(...params).all();

    // Build CSV
    const headers = [
      "id", "github_username", "email", "score", "tier", "outreach_status",
      "airdrop_status", "stacks_address", "address_valid", "created_at"
    ];

    const rows = (results.results || []).map((p: Record<string, unknown>) =>
      headers.map((h) => {
        const val = p[h];
        if (val === null || val === undefined) return "";
        if (typeof val === "string" && val.includes(",")) return `"${val}"`;
        return String(val);
      }).join(",")
    );

    const csv = [headers.join(","), ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="prospects-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export failed:", error);
    return c.json({ error: "Export failed" }, 500);
  }
});

// Sync endpoint - receives data from CLI
app.post("/api/sync", async (c) => {
  const db = c.env.DB;

  try {
    const body = await c.req.json<{
      prospects: Array<{
        github_username: string;
        github_id?: number;
        email?: string;
        repos_json?: string;
        score: number;
        tier: string;
        discovered_via?: string;
        outreach_status: string;
        target_repo?: string;
        pr_url?: string;
        pr_number?: number;
        pr_opened_at?: string;
        stacks_address?: string;
        address_valid: number;
        verified_at?: string;
        airdrop_status: string;
        airdrop_txid?: string;
        airdrop_amount_sats?: number;
        airdrop_sent_at?: string;
        yield_enrolled: number;
        yield_protocol?: string;
        created_at: string;
        updated_at: string;
      }>;
      daily_limits?: { date: string; prs_opened: number; airdrops_sent: number };
    }>();

    // Upsert prospects
    const stmt = db.prepare(`
      INSERT INTO prospects (
        github_username, github_id, email, repos_json, score, tier, discovered_via,
        outreach_status, target_repo, pr_url, pr_number, pr_opened_at,
        stacks_address, address_valid, verified_at,
        airdrop_status, airdrop_txid, airdrop_amount_sats, airdrop_sent_at,
        yield_enrolled, yield_protocol, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(github_username) DO UPDATE SET
        score = excluded.score,
        tier = excluded.tier,
        outreach_status = excluded.outreach_status,
        target_repo = excluded.target_repo,
        pr_url = excluded.pr_url,
        pr_number = excluded.pr_number,
        pr_opened_at = excluded.pr_opened_at,
        stacks_address = excluded.stacks_address,
        address_valid = excluded.address_valid,
        verified_at = excluded.verified_at,
        airdrop_status = excluded.airdrop_status,
        airdrop_txid = excluded.airdrop_txid,
        airdrop_amount_sats = excluded.airdrop_amount_sats,
        airdrop_sent_at = excluded.airdrop_sent_at,
        yield_enrolled = excluded.yield_enrolled,
        yield_protocol = excluded.yield_protocol,
        updated_at = excluded.updated_at
    `);

    const batch = body.prospects.map((p) =>
      stmt.bind(
        p.github_username, p.github_id ?? null, p.email ?? null, p.repos_json ?? null,
        p.score, p.tier, p.discovered_via ?? null,
        p.outreach_status, p.target_repo ?? null, p.pr_url ?? null, p.pr_number ?? null, p.pr_opened_at ?? null,
        p.stacks_address ?? null, p.address_valid, p.verified_at ?? null,
        p.airdrop_status, p.airdrop_txid ?? null, p.airdrop_amount_sats ?? null, p.airdrop_sent_at ?? null,
        p.yield_enrolled, p.yield_protocol ?? null, p.created_at, p.updated_at
      )
    );

    await db.batch(batch);

    // Update daily limits if provided
    if (body.daily_limits) {
      await db.prepare(`
        INSERT INTO daily_limits (date, prs_opened, airdrops_sent)
        VALUES (?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          prs_opened = excluded.prs_opened,
          airdrops_sent = excluded.airdrops_sent
      `).bind(body.daily_limits.date, body.daily_limits.prs_opened, body.daily_limits.airdrops_sent).run();
    }

    return c.json({ success: true, synced: body.prospects.length });
  } catch (error) {
    console.error("Sync failed:", error);
    return c.json({ error: "Sync failed" }, 500);
  }
});

export default app;
