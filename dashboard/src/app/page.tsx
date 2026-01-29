"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  totalProspects: number;
  byTier: { A: number; B: number; C: number; D: number; unqualified: number };
  byOutreachStatus: {
    pending: number;
    pr_opened: number;
    pr_merged: number;
    pr_closed: number;
    declined: number;
  };
  byAirdropStatus: {
    pending: number;
    sent: number;
    confirmed: number;
    failed: number;
  };
  verified: number;
  yieldEnrolled: number;
  todayPRs: number;
  todayAirdrops: number;
  topProspects: {
    id: number;
    username: string;
    tier: string;
    score: number;
    outreachStatus: string;
    airdropStatus: string;
    verified: boolean;
  }[];
  recentProspects: {
    id: number;
    username: string;
    tier: string;
    score: number;
    outreachStatus: string;
    airdropStatus: string;
    verified: boolean;
    createdAt: string;
  }[];
}

const DEMO_STATS: Stats = {
  totalProspects: 1247,
  byTier: { A: 89, B: 234, C: 456, D: 312, unqualified: 156 },
  byOutreachStatus: { pending: 523, pr_opened: 312, pr_merged: 178, pr_closed: 89, declined: 45 },
  byAirdropStatus: { pending: 234, sent: 89, confirmed: 156, failed: 12 },
  verified: 245,
  yieldEnrolled: 67,
  todayPRs: 12,
  todayAirdrops: 8,
  topProspects: [
    { id: 1, username: "neural_architect", tier: "A", score: 94, outreachStatus: "pr_merged", airdropStatus: "confirmed", verified: true },
    { id: 2, username: "crypto_builder", tier: "A", score: 91, outreachStatus: "pr_merged", airdropStatus: "confirmed", verified: true },
    { id: 3, username: "agent_smith_dev", tier: "A", score: 88, outreachStatus: "pr_opened", airdropStatus: "pending", verified: true },
  ],
  recentProspects: [],
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      const apiUrl = typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "/api/stats"
        : "https://appleseed-api.c3dar.workers.dev/api/stats";

      try {
        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error("API unavailable");
        const data = await res.json();
        if (data.error || data.totalProspects === undefined) {
          setStats(DEMO_STATS);
          setIsDemo(true);
        } else {
          setStats(data);
          setIsDemo(data.totalProspects === 0);
        }
      } catch {
        setStats(DEMO_STATS);
        setIsDemo(true);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-[#00f0ff] text-sm tracking-wider animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  const s = stats!;
  const qualified = s.totalProspects - s.byTier.unqualified;
  const contacted = s.byOutreachStatus.pr_opened + s.byOutreachStatus.pr_merged + s.byOutreachStatus.pr_closed;
  const airdropped = s.byAirdropStatus.confirmed + s.byAirdropStatus.sent;

  // Pipeline stages for the funnel
  const pipeline = [
    { label: "Discovered", value: s.totalProspects, color: "#6a6a8a" },
    { label: "Qualified", value: qualified, color: "#00f0ff" },
    { label: "Contacted", value: contacted, color: "#ffcc00" },
    { label: "Verified", value: s.verified, color: "#00ff88" },
    { label: "Airdropped", value: airdropped, color: "#00ff88" },
  ];

  const tierColors: Record<string, string> = {
    A: "#00ff88",
    B: "#00f0ff",
    C: "#ffcc00",
    D: "#6a6a8a",
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: "Pending", color: "#6a6a8a" },
    pr_opened: { label: "PR Sent", color: "#00f0ff" },
    pr_merged: { label: "Merged", color: "#00ff88" },
    pr_closed: { label: "Closed", color: "#ffcc00" },
    declined: { label: "Declined", color: "#ff3366" },
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appleseed</h1>
          <p className="text-[#6a6a8a] text-sm">Distribution Engine for Bitcoin AI Agents</p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/leads"
            className="px-4 py-2 bg-[#0d0d14] border border-[#1a1a2e] rounded text-sm hover:border-[#00f0ff] transition-colors"
          >
            Leads CRM
          </Link>
          <Link
            href="/airdrops"
            className="px-4 py-2 bg-[#0d0d14] border border-[#f7931a]/30 rounded text-sm hover:border-[#f7931a] transition-colors text-[#f7931a]"
          >
            Airdrop Feed
          </Link>
          {isDemo && (
            <span className="px-3 py-1 text-xs bg-[#ffcc00]/10 text-[#ffcc00] border border-[#ffcc00]/30 rounded">
              Demo Data
            </span>
          )}
        </div>
      </header>

      {/* Pipeline Overview - The Main Story */}
      <section className="mb-10">
        <h2 className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-4">Pipeline</h2>
        <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-6">
          <div className="flex items-center justify-between">
            {pipeline.map((stage, i) => (
              <div key={stage.label} className="flex items-center">
                <div className="text-center">
                  <div
                    className="text-3xl font-bold mb-1"
                    style={{ color: stage.color }}
                  >
                    {stage.value.toLocaleString()}
                  </div>
                  <div className="text-xs text-[#6a6a8a] uppercase tracking-wider">
                    {stage.label}
                  </div>
                </div>
                {i < pipeline.length - 1 && (
                  <div className="mx-6 text-[#1a1a2e] text-2xl">→</div>
                )}
              </div>
            ))}
          </div>

          {/* Conversion rates */}
          {s.totalProspects > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#1a1a2e]">
              <div className="text-xs text-[#6a6a8a]">
                <span className="text-white">{((qualified / s.totalProspects) * 100).toFixed(0)}%</span> qualified
              </div>
              <div className="text-xs text-[#6a6a8a]">
                <span className="text-white">{qualified > 0 ? ((contacted / qualified) * 100).toFixed(0) : 0}%</span> contacted
              </div>
              <div className="text-xs text-[#6a6a8a]">
                <span className="text-white">{contacted > 0 ? ((s.verified / contacted) * 100).toFixed(0) : 0}%</span> verified
              </div>
              <div className="text-xs text-[#6a6a8a]">
                <span className="text-white">{s.verified > 0 ? ((airdropped / s.verified) * 100).toFixed(0) : 0}%</span> airdropped
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Left: Tier Breakdown */}
        <section>
          <h2 className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-4">Prospects by Tier</h2>
          <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-6">
            <div className="space-y-4">
              {[
                { tier: "A", label: "Hot Leads", count: s.byTier.A, desc: "High-value AI builders" },
                { tier: "B", label: "Warm Leads", count: s.byTier.B, desc: "Active developers" },
                { tier: "C", label: "Cool Leads", count: s.byTier.C, desc: "Potential targets" },
                { tier: "D", label: "Skip", count: s.byTier.D, desc: "Low priority" },
              ].map(({ tier, label, count, desc }) => {
                const pct = s.totalProspects > 0 ? (count / s.totalProspects) * 100 : 0;
                return (
                  <div key={tier}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-8 h-8 rounded flex items-center justify-center text-sm font-bold"
                          style={{ backgroundColor: tierColors[tier] + "20", color: tierColors[tier] }}
                        >
                          {tier}
                        </span>
                        <div>
                          <div className="text-sm font-medium">{label}</div>
                          <div className="text-xs text-[#6a6a8a]">{desc}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{count}</div>
                        <div className="text-xs text-[#6a6a8a]">{pct.toFixed(0)}%</div>
                      </div>
                    </div>
                    <div className="h-2 bg-[#1a1a2e] rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: tierColors[tier],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right: Top Prospects */}
        <section>
          <h2 className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-4">Top Prospects</h2>
          <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg overflow-hidden">
            {s.topProspects.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1a1a2e] text-left text-xs text-[#6a6a8a] uppercase">
                    <th className="px-4 py-3">Developer</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {s.topProspects.slice(0, 8).map((p) => {
                    const status = statusLabels[p.outreachStatus] || statusLabels.pending;
                    return (
                      <tr key={p.id} className="border-b border-[#1a1a2e] last:border-0">
                        <td className="px-4 py-3">
                          <a
                            href={`https://github.com/${p.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#00f0ff] hover:underline"
                          >
                            {p.username}
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: tierColors[p.tier] + "20",
                              color: tierColors[p.tier]
                            }}
                          >
                            {p.tier}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{p.score}</td>
                        <td className="px-4 py-3">
                          <span
                            className="text-xs"
                            style={{ color: status.color }}
                          >
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-8 text-center text-[#6a6a8a] text-sm">
                No prospects yet. Run a scan to discover developers.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Bottom Stats Row */}
      <section className="mt-8">
        <h2 className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-4">Outreach Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Pending", value: s.byOutreachStatus.pending, color: "#6a6a8a" },
            { label: "PR Opened", value: s.byOutreachStatus.pr_opened, color: "#00f0ff" },
            { label: "PR Merged", value: s.byOutreachStatus.pr_merged, color: "#00ff88" },
            { label: "PR Closed", value: s.byOutreachStatus.pr_closed, color: "#ffcc00" },
            { label: "Declined", value: s.byOutreachStatus.declined, color: "#ff3366" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-4"
            >
              <div className="text-2xl font-bold" style={{ color }}>{value}</div>
              <div className="text-xs text-[#6a6a8a] mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Airdrop Stats */}
      <section className="mt-8">
        <h2 className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-4">Airdrop Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Pending", value: s.byAirdropStatus.pending, color: "#6a6a8a" },
            { label: "Sent", value: s.byAirdropStatus.sent, color: "#00f0ff" },
            { label: "Confirmed", value: s.byAirdropStatus.confirmed, color: "#00ff88" },
            { label: "Failed", value: s.byAirdropStatus.failed, color: "#ff3366" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-4"
            >
              <div className="text-2xl font-bold" style={{ color }}>{value}</div>
              <div className="text-xs text-[#6a6a8a] mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t border-[#1a1a2e] text-xs text-[#6a6a8a]">
        <div className="flex items-center justify-between">
          <span>Appleseed v2 - AIBTC Distribution Engine</span>
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </footer>
    </div>
  );
}
