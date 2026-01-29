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
