"use client";

import { useEffect, useState, useCallback } from "react";

interface Activity {
  id: number;
  action: string;
  prospectId: number | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const API_URL = "https://appleseed-api.c3dar.workers.dev";

const actionConfig: Record<string, { icon: string; color: string; label: string }> = {
  scan_started: { icon: "🔍", color: "#00f0ff", label: "Scan Started" },
  scan_completed: { icon: "✅", color: "#00ff88", label: "Scan Completed" },
  prospect_discovered: { icon: "👤", color: "#00f0ff", label: "Prospect Discovered" },
  prospect_qualified: { icon: "⭐", color: "#ffcc00", label: "Prospect Qualified" },
  pr_opened: { icon: "📬", color: "#00f0ff", label: "PR Opened" },
  pr_merged: { icon: "🎉", color: "#00ff88", label: "PR Merged" },
  pr_closed: { icon: "📪", color: "#6a6a8a", label: "PR Closed" },
  address_verified: { icon: "✓", color: "#00ff88", label: "Address Verified" },
  airdrop_sent: { icon: "💰", color: "#f7931a", label: "Airdrop Sent" },
  airdrop_confirmed: { icon: "✅", color: "#00ff88", label: "Airdrop Confirmed" },
  sync_completed: { icon: "🔄", color: "#00f0ff", label: "Sync Completed" },
  error: { icon: "❌", color: "#ff3366", label: "Error" },
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  if (diffSecs > 10) return `${diffSecs}s ago`;
  return "just now";
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchActivity = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));

      const res = await fetch(`${API_URL}/api/activity?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setActivities(data.activities || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch activity:", err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchActivity]);

  const totalPages = Math.ceil(total / limit);

  // Demo data for empty state
  const demoActivities: Activity[] = [
    { id: 1, action: "scan_completed", prospectId: null, details: { strategy: "mcp", found: 45 }, createdAt: new Date(Date.now() - 300000).toISOString() },
    { id: 2, action: "prospect_qualified", prospectId: 123, details: { username: "ai_builder", tier: "A", score: 87 }, createdAt: new Date(Date.now() - 600000).toISOString() },
    { id: 3, action: "pr_opened", prospectId: 123, details: { username: "ai_builder", repo: "awesome-mcp" }, createdAt: new Date(Date.now() - 900000).toISOString() },
    { id: 4, action: "address_verified", prospectId: 124, details: { username: "crypto_dev", address: "SP1YD..." }, createdAt: new Date(Date.now() - 1800000).toISOString() },
    { id: 5, action: "airdrop_sent", prospectId: 124, details: { username: "crypto_dev", amount: 10000 }, createdAt: new Date(Date.now() - 2400000).toISOString() },
    { id: 6, action: "sync_completed", prospectId: null, details: { synced: 337 }, createdAt: new Date(Date.now() - 3600000).toISOString() },
  ];

  const displayActivities = activities.length > 0 ? activities : demoActivities;
  const isDemo = activities.length === 0 && !loading;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {isDemo && (
        <div className="mx-4 md:mx-8 mt-6 p-3 bg-[#ffcc00]/10 border border-[#ffcc00]/30 rounded-lg text-center">
          <span className="text-sm text-[#ffcc00]">Demo Data - Activity will appear when the daemon runs</span>
        </div>
      )}
      <div className="px-4 md:px-8 py-6">
        {loading ? (
          <div className="text-center py-12 text-[#6a6a8a]">Loading activity...</div>
        ) : (
          <>
            {/* Timeline */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-6 top-0 bottom-0 w-px bg-[#1a1a2e]"></div>

              <div className="space-y-4">
                {displayActivities.map((activity) => {
                  const config = actionConfig[activity.action] || {
                    icon: "•",
                    color: "#6a6a8a",
                    label: activity.action,
                  };

                  return (
                    <div key={activity.id} className="relative flex gap-4 pl-12">
                      {/* Icon */}
                      <div
                        className="absolute left-0 w-12 h-12 rounded-full flex items-center justify-center text-xl"
                        style={{ backgroundColor: config.color + "20" }}
                      >
                        {config.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-4 hover:border-[#2a2a4e] transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-medium" style={{ color: config.color }}>
                              {config.label}
                            </div>
                            <div className="text-sm text-[#6a6a8a] mt-1">
                              {renderActivityDetails(activity)}
                            </div>
                          </div>
                          <div className="text-xs text-[#6a6a8a] whitespace-nowrap">
                            {formatTimeAgo(activity.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-8">
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
            )}
          </>
        )}
      </div>
    </div>
  );
}

function renderActivityDetails(activity: Activity): React.ReactNode {
  const d = (activity.details || {}) as Record<string, string | number | undefined>;

  switch (activity.action) {
    case "scan_started":
    case "scan_completed":
      return (
        <span>
          Strategy: <span className="text-white">{String(d.strategy || "unknown")}</span>
          {d.found !== undefined && (
            <span>, found <span className="text-white">{String(d.found)}</span> prospects</span>
          )}
        </span>
      );
    case "prospect_discovered":
    case "prospect_qualified":
      return (
        <span>
          <span className="text-[#00f0ff]">@{String(d.username || "unknown")}</span>
          {d.tier && <span> → Tier <span className="text-white">{String(d.tier)}</span></span>}
          {d.score !== undefined && <span> (score: {String(d.score)})</span>}
        </span>
      );
    case "pr_opened":
    case "pr_merged":
    case "pr_closed":
      return (
        <span>
          <span className="text-[#00f0ff]">@{String(d.username || "unknown")}</span>
          {d.repo && <span> on <span className="text-white">{String(d.repo)}</span></span>}
        </span>
      );
    case "address_verified":
      return (
        <span>
          <span className="text-[#00f0ff]">@{String(d.username || "unknown")}</span>
          {d.address && <span> → <span className="font-mono text-white">{String(d.address)}</span></span>}
        </span>
      );
    case "airdrop_sent":
    case "airdrop_confirmed":
      return (
        <span>
          <span className="text-[#00f0ff]">@{String(d.username || "unknown")}</span>
          {d.amount !== undefined && (
            <span> received <span className="text-[#f7931a]">{Number(d.amount).toLocaleString()} sats</span></span>
          )}
        </span>
      );
    case "sync_completed":
      return (
        <span>
          Synced <span className="text-white">{String(d.synced || 0)}</span> prospects to cloud
        </span>
      );
    case "error":
      return <span className="text-[#ff3366]">{String(d.message || "Unknown error")}</span>;
    default:
      return <span>{JSON.stringify(d)}</span>;
  }
}
