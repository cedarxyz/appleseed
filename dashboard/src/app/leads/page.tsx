"use client";

import { useEffect, useState, useCallback } from "react";

interface Repo {
  name: string;
  fullName: string;
  url: string;
  stars: number;
  description: string;
  language: string;
}

interface Prospect {
  id: number;
  username: string;
  githubId: number;
  email: string | null;
  repos: Repo[];
  score: number;
  tier: string | null;
  discoveredVia: string | null;
  outreachStatus: string;
  targetRepo: string | null;
  prUrl: string | null;
  prNumber: number | null;
  stacksAddress: string | null;
  verified: boolean;
  airdropStatus: string;
  airdropTxid: string | null;
  airdropAmountSats: number | null;
  yieldEnrolled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProspectsResponse {
  prospects: Prospect[];
  total: number;
  limit: number;
  offset: number;
}

const API_URL = "https://appleseed-api.c3dar.workers.dev";

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

const airdropLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#6a6a8a" },
  sent: { label: "Sent", color: "#00f0ff" },
  confirmed: { label: "Confirmed", color: "#00ff88" },
  failed: { label: "Failed", color: "#ff3366" },
};

export default function LeadsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);

  // Filters
  const [tierFilter, setTierFilter] = useState("");
  const [outreachFilter, setOutreachFilter] = useState("");
  const [airdropFilter, setAirdropFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting
  const [sortBy, setSortBy] = useState("score");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination
  const [page, setPage] = useState(0);
  const limit = 25;

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tierFilter) params.set("tier", tierFilter);
      if (outreachFilter) params.set("outreach", outreachFilter);
      if (airdropFilter) params.set("airdrop", airdropFilter);
      if (searchQuery) params.set("search", searchQuery);
      params.set("sort", sortBy);
      params.set("order", sortOrder);
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));

      const res = await fetch(`${API_URL}/api/prospects?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: ProspectsResponse = await res.json();
      setProspects(data.prospects);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to fetch prospects:", err);
    } finally {
      setLoading(false);
    }
  }, [tierFilter, outreachFilter, airdropFilter, searchQuery, sortBy, sortOrder, page]);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [tierFilter, outreachFilter, airdropFilter, searchQuery, sortBy, sortOrder]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  const totalPages = Math.ceil(total / limit);

  // CSV Export
  const handleExport = () => {
    const params = new URLSearchParams();
    if (tierFilter) params.set("tier", tierFilter);
    if (outreachFilter) params.set("outreach", outreachFilter);
    if (airdropFilter) params.set("airdrop", airdropFilter);

    window.open(`${API_URL}/api/prospects/export?${params}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Filters & Actions Bar */}
      <div className="border-b border-[#1a1a2e] px-4 md:px-8 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 md:gap-4">
          {/* Search */}
          <input
            type="text"
            placeholder="Search username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-2 bg-[#0d0d14] border border-[#1a1a2e] rounded text-sm text-white placeholder-[#6a6a8a] focus:outline-none focus:border-[#00f0ff] w-48"
          />

          {/* Tier Filter */}
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="px-3 py-2 bg-[#0d0d14] border border-[#1a1a2e] rounded text-sm text-white focus:outline-none focus:border-[#00f0ff]"
          >
            <option value="">All Tiers</option>
            <option value="A">Tier A</option>
            <option value="B">Tier B</option>
            <option value="C">Tier C</option>
            <option value="D">Tier D</option>
          </select>

          {/* Outreach Filter */}
          <select
            value={outreachFilter}
            onChange={(e) => setOutreachFilter(e.target.value)}
            className="px-3 py-2 bg-[#0d0d14] border border-[#1a1a2e] rounded text-sm text-white focus:outline-none focus:border-[#00f0ff]"
          >
            <option value="">All Outreach</option>
            <option value="pending">Pending</option>
            <option value="pr_opened">PR Opened</option>
            <option value="pr_merged">PR Merged</option>
            <option value="pr_closed">PR Closed</option>
            <option value="declined">Declined</option>
          </select>

          {/* Airdrop Filter */}
          <select
            value={airdropFilter}
            onChange={(e) => setAirdropFilter(e.target.value)}
            className="px-3 py-2 bg-[#0d0d14] border border-[#1a1a2e] rounded text-sm text-white focus:outline-none focus:border-[#00f0ff]"
          >
            <option value="">All Airdrop</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="confirmed">Confirmed</option>
            <option value="failed">Failed</option>
          </select>

          {/* Clear Filters */}
          {(tierFilter || outreachFilter || airdropFilter || searchQuery) && (
            <button
              onClick={() => {
                setTierFilter("");
                setOutreachFilter("");
                setAirdropFilter("");
                setSearchQuery("");
              }}
              className="text-sm text-[#ff3366] hover:underline"
            >
              Clear
            </button>
          )}
          </div>

          {/* Right side: Count + Export */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#6a6a8a]">
              {total.toLocaleString()} prospects
            </span>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-[#0d0d14] border border-[#1a1a2e] rounded text-sm hover:border-[#00f0ff] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="px-4 md:px-8 py-6">
        {loading ? (
          <div className="text-center py-12 text-[#6a6a8a]">Loading...</div>
        ) : prospects.length === 0 ? (
          <div className="text-center py-12 text-[#6a6a8a]">No prospects found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1a1a2e] text-left text-xs text-[#6a6a8a] uppercase">
                    <th className="px-4 py-3 w-14"></th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:text-white"
                      onClick={() => handleSort("github_username")}
                    >
                      Developer {sortBy === "github_username" && (sortOrder === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:text-white hidden md:table-cell"
                      onClick={() => handleSort("tier")}
                    >
                      Tier {sortBy === "tier" && (sortOrder === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:text-white hidden md:table-cell"
                      onClick={() => handleSort("score")}
                    >
                      Score {sortBy === "score" && (sortOrder === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:text-white hidden lg:table-cell"
                      onClick={() => handleSort("outreach_status")}
                    >
                      Outreach {sortBy === "outreach_status" && (sortOrder === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:text-white hidden lg:table-cell"
                      onClick={() => handleSort("airdrop_status")}
                    >
                      Airdrop {sortBy === "airdrop_status" && (sortOrder === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-4 py-3 hidden xl:table-cell">Verified</th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:text-white hidden xl:table-cell"
                      onClick={() => handleSort("created_at")}
                    >
                      Added {sortBy === "created_at" && (sortOrder === "asc" ? "↑" : "↓")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.map((p) => {
                    const outreach = statusLabels[p.outreachStatus] || statusLabels.pending;
                    const airdrop = airdropLabels[p.airdropStatus] || airdropLabels.pending;
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-[#1a1a2e] hover:bg-[#0d0d14] cursor-pointer transition-colors"
                        onClick={() => setSelectedProspect(p)}
                      >
                        <td className="px-4 py-3">
                          <img
                            src={`https://avatars.githubusercontent.com/u/${p.githubId}?s=40`}
                            alt={p.username}
                            className="w-10 h-10 rounded-full bg-[#1a1a2e] object-cover"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[#00f0ff] font-medium">{p.username}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {p.tier ? (
                            <span
                              className="px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                backgroundColor: tierColors[p.tier] + "20",
                                color: tierColors[p.tier],
                              }}
                            >
                              {p.tier}
                            </span>
                          ) : (
                            <span className="text-[#6a6a8a] text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm hidden md:table-cell">{p.score}</td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs" style={{ color: outreach.color }}>
                            {outreach.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs" style={{ color: airdrop.color }}>
                            {airdrop.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {p.verified ? (
                            <span className="text-[#00ff88]">✓</span>
                          ) : (
                            <span className="text-[#6a6a8a]">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#6a6a8a] hidden xl:table-cell">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-[#6a6a8a]">
                Showing {page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 bg-[#0d0d14] border border-[#1a1a2e] rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:border-[#00f0ff]"
                >
                  Previous
                </button>
                <span className="text-sm text-[#6a6a8a]">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 bg-[#0d0d14] border border-[#1a1a2e] rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:border-[#00f0ff]"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedProspect && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-8 z-50"
          onClick={() => setSelectedProspect(null)}
        >
          <div
            className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <ProspectDetail prospect={selectedProspect} onClose={() => setSelectedProspect(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function ProspectDetail({ prospect, onClose }: { prospect: Prospect; onClose: () => void }) {
  const outreach = statusLabels[prospect.outreachStatus] || statusLabels.pending;
  const airdrop = airdropLabels[prospect.airdropStatus] || airdropLabels.pending;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <img
            src={`https://avatars.githubusercontent.com/u/${prospect.githubId}?s=80`}
            alt={prospect.username}
            className="w-16 h-16 rounded-full bg-[#1a1a2e]"
          />
          <div>
            <h2 className="text-xl font-bold">{prospect.username}</h2>
            <a
              href={`https://github.com/${prospect.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#00f0ff] hover:underline"
            >
              github.com/{prospect.username}
            </a>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[#6a6a8a] hover:text-white text-2xl leading-none"
        >
          ×
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[#0a0a0f] rounded-lg p-4 text-center">
          <div
            className="text-2xl font-bold"
            style={{ color: prospect.tier ? tierColors[prospect.tier] : "#6a6a8a" }}
          >
            {prospect.tier || "-"}
          </div>
          <div className="text-xs text-[#6a6a8a] mt-1">Tier</div>
        </div>
        <div className="bg-[#0a0a0f] rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white">{prospect.score}</div>
          <div className="text-xs text-[#6a6a8a] mt-1">Score</div>
        </div>
        <div className="bg-[#0a0a0f] rounded-lg p-4 text-center">
          <div className="text-sm font-medium" style={{ color: outreach.color }}>
            {outreach.label}
          </div>
          <div className="text-xs text-[#6a6a8a] mt-1">Outreach</div>
        </div>
        <div className="bg-[#0a0a0f] rounded-lg p-4 text-center">
          <div className="text-sm font-medium" style={{ color: airdrop.color }}>
            {airdrop.label}
          </div>
          <div className="text-xs text-[#6a6a8a] mt-1">Airdrop</div>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-4">
        <DetailRow label="GitHub ID" value={String(prospect.githubId)} />
        <DetailRow label="Email" value={prospect.email || "-"} />
        <DetailRow label="Discovered Via" value={prospect.discoveredVia || "-"} />
        <DetailRow label="Target Repo" value={prospect.targetRepo || "-"} />

        {prospect.prUrl && (
          <DetailRow
            label="PR URL"
            value={
              <a
                href={prospect.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00f0ff] hover:underline"
              >
                {prospect.prUrl}
              </a>
            }
          />
        )}

        <DetailRow
          label="Stacks Address"
          value={
            prospect.stacksAddress ? (
              <span className="font-mono text-sm">{prospect.stacksAddress}</span>
            ) : (
              "-"
            )
          }
        />
        <DetailRow
          label="Address Verified"
          value={prospect.verified ? <span className="text-[#00ff88]">Yes</span> : "No"}
        />

        {prospect.airdropTxid && (
          <DetailRow
            label="Airdrop TX"
            value={
              <a
                href={`https://explorer.stacks.co/txid/${prospect.airdropTxid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00f0ff] hover:underline font-mono text-sm"
              >
                {prospect.airdropTxid.slice(0, 16)}...
              </a>
            }
          />
        )}

        {prospect.airdropAmountSats && (
          <DetailRow
            label="Airdrop Amount"
            value={`${(prospect.airdropAmountSats / 100000000).toFixed(8)} sBTC`}
          />
        )}

        <DetailRow
          label="Yield Enrolled"
          value={prospect.yieldEnrolled ? <span className="text-[#00ff88]">Yes</span> : "No"}
        />

        {prospect.repos && prospect.repos.length > 0 && (
          <div>
            <div className="text-xs text-[#6a6a8a] uppercase mb-2">Matched Repos</div>
            <div className="flex flex-wrap gap-2">
              {prospect.repos.map((repo, i) => (
                <a
                  key={i}
                  href={repo.url || `https://github.com/${repo.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 bg-[#0a0a0f] border border-[#1a1a2e] rounded text-xs text-[#00f0ff] hover:border-[#00f0ff]"
                >
                  {repo.fullName || repo.name}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-[#1a1a2e] flex justify-between text-xs text-[#6a6a8a]">
          <span>Added: {new Date(prospect.createdAt).toLocaleString()}</span>
          <span>Updated: {new Date(prospect.updatedAt).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#1a1a2e]">
      <span className="text-sm text-[#6a6a8a]">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}
