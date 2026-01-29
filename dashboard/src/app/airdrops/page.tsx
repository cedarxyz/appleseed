"use client";

import { useEffect, useState, useCallback } from "react";

interface Airdrop {
  id: number;
  username: string;
  githubId: number;
  stacksAddress: string;
  status: "sent" | "confirmed";
  txid: string;
  amountSats: number;
  sentAt: string;
}

interface AirdropsResponse {
  airdrops: Airdrop[];
  totalCount: number;
  totalSats: number;
  limit: number;
  offset: number;
}

const API_URL = "https://appleseed-api.c3dar.workers.dev";

function formatSats(sats: number): string {
  const btc = sats / 100_000_000;
  if (btc >= 0.001) {
    return `${btc.toFixed(6)} sBTC`;
  }
  return `${sats.toLocaleString()} sats`;
}

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
  return "just now";
}

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

export default function AirdropsPage() {
  const [airdrops, setAirdrops] = useState<Airdrop[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalSats, setTotalSats] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchAirdrops = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));

      const res = await fetch(`${API_URL}/api/airdrops?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: AirdropsResponse = await res.json();
      setAirdrops(data.airdrops);
      setTotalCount(data.totalCount);
      setTotalSats(data.totalSats);
    } catch (err) {
      console.error("Failed to fetch airdrops:", err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchAirdrops();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchAirdrops, 30000);
    return () => clearInterval(interval);
  }, [fetchAirdrops]);

  const totalPages = Math.ceil(totalCount / limit);
  const totalBtc = totalSats / 100_000_000;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Total Stats */}
      <div className="px-4 md:px-8 py-6">
        <div className="bg-gradient-to-br from-[#0d0d14] to-[#1a1a2e] border border-[#1a1a2e] rounded-xl p-8 text-center">
          <div className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-2">
            Total sBTC Distributed
          </div>
          <div className="text-5xl font-bold text-[#f7931a] mb-2">
            {totalBtc.toFixed(8)}
          </div>
          <div className="text-lg text-[#6a6a8a]">sBTC</div>
          <div className="mt-4 pt-4 border-t border-[#1a1a2e] flex items-center justify-center gap-8">
            <div>
              <div className="text-2xl font-bold text-white">{totalCount}</div>
              <div className="text-xs text-[#6a6a8a]">Recipients</div>
            </div>
            <div className="w-px h-8 bg-[#1a1a2e]"></div>
            <div>
              <div className="text-2xl font-bold text-white">
                {totalCount > 0 ? Math.round(totalSats / totalCount).toLocaleString() : 0}
              </div>
              <div className="text-xs text-[#6a6a8a]">Avg. Sats</div>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="px-8 pb-8">
        <h2 className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-4">
          Recent Airdrops
        </h2>

        {loading && airdrops.length === 0 ? (
          <div className="text-center py-12 text-[#6a6a8a]">Loading...</div>
        ) : airdrops.length === 0 ? (
          <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-12 text-center">
            <div className="text-4xl mb-4">🌱</div>
            <div className="text-[#6a6a8a]">No airdrops yet</div>
            <div className="text-sm text-[#6a6a8a] mt-2">
              Airdrops will appear here once they&apos;re sent
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {airdrops.map((airdrop) => (
              <div
                key={airdrop.id}
                className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-4 hover:border-[#2a2a4e] transition-colors"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <img
                    src={`https://avatars.githubusercontent.com/u/${airdrop.githubId}?s=48`}
                    alt={airdrop.username}
                    className="w-12 h-12 rounded-full bg-[#1a1a2e] flex-shrink-0"
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <a
                        href={`https://github.com/${airdrop.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[#00f0ff] hover:underline truncate"
                      >
                        {airdrop.username}
                      </a>
                      {airdrop.status === "confirmed" ? (
                        <span className="px-1.5 py-0.5 text-[10px] bg-[#00ff88]/10 text-[#00ff88] rounded">
                          ✓ Confirmed
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] bg-[#ffcc00]/10 text-[#ffcc00] rounded">
                          Pending
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <a
                        href={`https://explorer.stacks.co/address/${airdrop.stacksAddress}?chain=mainnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[#6a6a8a] hover:text-white"
                      >
                        {truncateAddress(airdrop.stacksAddress)}
                      </a>
                      {airdrop.txid && (
                        <>
                          <span className="text-[#2a2a4e]">•</span>
                          <a
                            href={`https://explorer.stacks.co/txid/${airdrop.txid}?chain=mainnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#6a6a8a] hover:text-[#00f0ff]"
                          >
                            View TX
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Amount & Time */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-[#f7931a]">
                      +{formatSats(airdrop.amountSats)}
                    </div>
                    <div className="text-xs text-[#6a6a8a]">
                      {airdrop.sentAt ? formatTimeAgo(airdrop.sentAt) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-[#6a6a8a]">
              Showing {page * limit + 1}-{Math.min((page + 1) * limit, totalCount)} of {totalCount}
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
      </div>
    </div>
  );
}
