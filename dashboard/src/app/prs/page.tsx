"use client";

import { useEffect, useState, useCallback } from "react";

interface PR {
  id: number;
  username: string;
  githubId: number;
  tier: string;
  score: number;
  targetRepo: string;
  prUrl: string;
  prNumber: number;
  prOpenedAt: string;
  status: string;
  hasAddress: boolean;
  verified: boolean;
}

interface PRStats {
  total: number;
  open: number;
  merged: number;
  closed: number;
}

const API_URL = "https://appleseed-api.c3dar.workers.dev";

const tierColors: Record<string, string> = {
  A: "#00ff88",
  B: "#00f0ff",
  C: "#ffcc00",
  D: "#6a6a8a",
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pr_opened: { label: "Open", color: "#00f0ff" },
  pr_merged: { label: "Merged", color: "#00ff88" },
  pr_closed: { label: "Closed", color: "#6a6a8a" },
  declined: { label: "Declined", color: "#ff3366" },
};

function formatDaysAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

export default function PRsPage() {
  const [prs, setPrs] = useState<PR[]>([]);
  const [stats, setStats] = useState<PRStats>({ total: 0, open: 0, merged: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "merged" | "closed">("all");

  const fetchPRs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);

      const res = await fetch(`${API_URL}/api/prs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setPrs(data.prs || []);
      setStats(data.stats || { total: 0, open: 0, merged: 0, closed: 0 });
    } catch (err) {
      console.error("Failed to fetch PRs:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchPRs();
  }, [fetchPRs]);

  // Demo data
  const demoPRs: PR[] = [
    { id: 1, username: "ai_builder", githubId: 12345, tier: "A", score: 92, targetRepo: "awesome-mcp", prUrl: "https://github.com/ai_builder/awesome-mcp/pull/42", prNumber: 42, prOpenedAt: new Date(Date.now() - 86400000).toISOString(), status: "pr_opened", hasAddress: false, verified: false },
    { id: 2, username: "crypto_dev", githubId: 23456, tier: "A", score: 88, targetRepo: "bitcoin-agent", prUrl: "https://github.com/crypto_dev/bitcoin-agent/pull/15", prNumber: 15, prOpenedAt: new Date(Date.now() - 172800000).toISOString(), status: "pr_merged", hasAddress: true, verified: true },
    { id: 3, username: "neural_architect", githubId: 34567, tier: "B", score: 76, targetRepo: "langchain-tools", prUrl: "https://github.com/neural_architect/langchain-tools/pull/8", prNumber: 8, prOpenedAt: new Date(Date.now() - 259200000).toISOString(), status: "pr_opened", hasAddress: true, verified: false },
  ];
  const demoStats = { total: 3, open: 2, merged: 1, closed: 0 };

  const displayPRs = prs.length > 0 ? prs : demoPRs;
  const displayStats = stats.total > 0 ? stats : demoStats;
  const isDemo = prs.length === 0 && !loading;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {isDemo && (
        <div className="mx-4 md:mx-8 mt-6 p-3 bg-[#ffcc00]/10 border border-[#ffcc00]/30 rounded-lg text-center">
          <span className="text-sm text-[#ffcc00]">Demo Data - PRs will appear after outreach begins</span>
        </div>
      )}
      <div className="px-4 md:px-8 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <button
            onClick={() => setFilter("all")}
            className={`bg-[#0d0d14] border rounded-lg p-4 text-left transition-colors ${
              filter === "all" ? "border-[#00f0ff]" : "border-[#1a1a2e] hover:border-[#2a2a4e]"
            }`}
          >
            <div className="text-2xl font-bold">{displayStats.total}</div>
            <div className="text-xs text-[#6a6a8a] mt-1">Total PRs</div>
          </button>
          <button
            onClick={() => setFilter("open")}
            className={`bg-[#0d0d14] border rounded-lg p-4 text-left transition-colors ${
              filter === "open" ? "border-[#00f0ff]" : "border-[#1a1a2e] hover:border-[#2a2a4e]"
            }`}
          >
            <div className="text-2xl font-bold text-[#00f0ff]">{displayStats.open}</div>
            <div className="text-xs text-[#6a6a8a] mt-1">Open</div>
          </button>
          <button
            onClick={() => setFilter("merged")}
            className={`bg-[#0d0d14] border rounded-lg p-4 text-left transition-colors ${
              filter === "merged" ? "border-[#00ff88]" : "border-[#1a1a2e] hover:border-[#2a2a4e]"
            }`}
          >
            <div className="text-2xl font-bold text-[#00ff88]">{displayStats.merged}</div>
            <div className="text-xs text-[#6a6a8a] mt-1">Merged</div>
          </button>
          <button
            onClick={() => setFilter("closed")}
            className={`bg-[#0d0d14] border rounded-lg p-4 text-left transition-colors ${
              filter === "closed" ? "border-[#6a6a8a]" : "border-[#1a1a2e] hover:border-[#2a2a4e]"
            }`}
          >
            <div className="text-2xl font-bold text-[#6a6a8a]">{displayStats.closed}</div>
            <div className="text-xs text-[#6a6a8a] mt-1">Closed</div>
          </button>
        </div>

        {/* PR List */}
        {loading ? (
          <div className="text-center py-12 text-[#6a6a8a]">Loading PRs...</div>
        ) : displayPRs.length === 0 ? (
          <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-12 text-center">
            <div className="text-4xl mb-4">📬</div>
            <div className="text-[#6a6a8a]">No PRs found</div>
          </div>
        ) : (
          <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1a1a2e] text-left text-xs text-[#6a6a8a] uppercase">
                  <th className="px-4 py-3 w-12"></th>
                  <th className="px-4 py-3">Developer</th>
                  <th className="px-4 py-3">Repository</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Response</th>
                  <th className="px-4 py-3">Opened</th>
                  <th className="px-4 py-3">PR</th>
                </tr>
              </thead>
              <tbody>
                {displayPRs.map((pr) => {
                  const status = statusConfig[pr.status] || statusConfig.pr_opened;
                  return (
                    <tr key={pr.id} className="border-b border-[#1a1a2e] last:border-0 hover:bg-[#0a0a0f]">
                      <td className="px-4 py-3">
                        <img
                          src={`https://avatars.githubusercontent.com/u/${pr.githubId}?s=32`}
                          alt={pr.username}
                          className="w-8 h-8 rounded-full bg-[#1a1a2e]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`https://github.com/${pr.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00f0ff] hover:underline font-medium"
                        >
                          {pr.username}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`https://github.com/${pr.username}/${pr.targetRepo}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#6a6a8a] hover:text-white"
                        >
                          {pr.targetRepo}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: tierColors[pr.tier] + "20",
                            color: tierColors[pr.tier],
                          }}
                        >
                          {pr.tier}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded text-xs"
                          style={{
                            backgroundColor: status.color + "20",
                            color: status.color,
                          }}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {pr.verified ? (
                          <span className="text-[#00ff88] text-sm">✓ Verified</span>
                        ) : pr.hasAddress ? (
                          <span className="text-[#ffcc00] text-sm">Address pending</span>
                        ) : (
                          <span className="text-[#6a6a8a] text-sm">Awaiting response</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#6a6a8a]">
                        {pr.prOpenedAt ? formatDaysAgo(pr.prOpenedAt) : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={pr.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00f0ff] hover:underline text-sm"
                        >
                          #{pr.prNumber}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
