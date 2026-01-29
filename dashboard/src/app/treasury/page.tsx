"use client";

import { useEffect, useState, useCallback } from "react";

interface TreasuryData {
  address: string;
  stxBalance: number;
  sbtcBalance: number;
  pendingAirdrops: number;
  pendingObligationSats: number;
  totalAirdroppedSats: number;
  transactions: {
    txid: string;
    type: string;
    status: string;
    timestamp: string | null;
    sender: string;
    amount?: string;
    recipient?: string;
  }[];
  lowBalanceAlert: boolean;
}

const API_URL = "https://appleseed-api.c3dar.workers.dev";

function formatSats(sats: number): string {
  const btc = sats / 100_000_000;
  return btc.toFixed(8);
}

function formatStx(microStx: number): string {
  return (microStx / 1_000_000).toFixed(2);
}

function truncateAddress(address: string, chars = 8): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return "just now";
}

export default function TreasuryPage() {
  const [data, setData] = useState<TreasuryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTreasury = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/treasury`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load treasury data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTreasury();
    const interval = setInterval(fetchTreasury, 30000);
    return () => clearInterval(interval);
  }, [fetchTreasury]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="px-4 md:px-8 py-6">
        {loading ? (
          <div className="text-center py-12 text-[#6a6a8a]">Loading treasury data...</div>
        ) : error ? (
          <div className="text-center py-12 text-[#ff3366]">{error}</div>
        ) : data ? (
          <>
            {/* Alert Banner */}
            {data.lowBalanceAlert && (
              <div className="mb-6 p-4 bg-[#ff3366]/10 border border-[#ff3366]/30 rounded-lg flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <div className="font-medium text-[#ff3366]">Low Balance Alert</div>
                  <div className="text-sm text-[#6a6a8a]">
                    Treasury balance is less than pending airdrop obligations
                  </div>
                </div>
              </div>
            )}

            {/* Main Balance Card */}
            <div className="bg-gradient-to-br from-[#0d0d14] to-[#1a1a2e] border border-[#1a1a2e] rounded-xl p-8 mb-8">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
                {/* sBTC Balance */}
                <div className="text-center lg:text-left">
                  <div className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-2">
                    sBTC Balance
                  </div>
                  <div className="text-5xl font-bold text-[#f7931a]">
                    {formatSats(data.sbtcBalance)}
                  </div>
                  <div className="text-lg text-[#6a6a8a]">sBTC</div>
                </div>

                {/* STX Balance */}
                <div className="text-center lg:text-left">
                  <div className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-2">
                    STX Balance
                  </div>
                  <div className="text-4xl font-bold text-white">
                    {formatStx(data.stxBalance)}
                  </div>
                  <div className="text-lg text-[#6a6a8a]">STX (for fees)</div>
                </div>

                {/* Address */}
                <div className="text-center lg:text-right">
                  <div className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-2">
                    Treasury Address
                  </div>
                  <a
                    href={`https://explorer.stacks.co/address/${data.address}?chain=mainnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[#00f0ff] hover:underline text-sm"
                  >
                    {truncateAddress(data.address, 12)}
                  </a>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-6">
                <div className="text-sm text-[#6a6a8a] mb-2">Pending Airdrops</div>
                <div className="text-3xl font-bold text-[#ffcc00]">
                  {data.pendingAirdrops}
                </div>
                <div className="text-sm text-[#6a6a8a] mt-1">
                  ~{formatSats(data.pendingObligationSats)} sBTC obligation
                </div>
              </div>

              <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-6">
                <div className="text-sm text-[#6a6a8a] mb-2">Total Airdropped</div>
                <div className="text-3xl font-bold text-[#00ff88]">
                  {formatSats(data.totalAirdroppedSats)}
                </div>
                <div className="text-sm text-[#6a6a8a] mt-1">sBTC distributed</div>
              </div>

              <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-6">
                <div className="text-sm text-[#6a6a8a] mb-2">Available After Pending</div>
                <div className="text-3xl font-bold" style={{
                  color: data.sbtcBalance - data.pendingObligationSats >= 0 ? "#00ff88" : "#ff3366"
                }}>
                  {formatSats(Math.max(0, data.sbtcBalance - data.pendingObligationSats))}
                </div>
                <div className="text-sm text-[#6a6a8a] mt-1">sBTC remaining</div>
              </div>
            </div>

            {/* Recent Transactions */}
            <div>
              <h2 className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-4">
                Recent Transactions
              </h2>
              <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg overflow-hidden">
                {data.transactions.length === 0 ? (
                  <div className="p-8 text-center text-[#6a6a8a]">
                    No recent transactions
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#1a1a2e] text-left text-xs text-[#6a6a8a] uppercase">
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Recipient</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Time</th>
                        <th className="px-4 py-3">TX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.transactions.map((tx) => (
                        <tr key={tx.txid} className="border-b border-[#1a1a2e] last:border-0">
                          <td className="px-4 py-3 text-sm">
                            {tx.type.replace(/_/g, " ")}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              tx.status === "success" ? "bg-[#00ff88]/10 text-[#00ff88]" :
                              tx.status === "pending" ? "bg-[#ffcc00]/10 text-[#ffcc00]" :
                              "bg-[#ff3366]/10 text-[#ff3366]"
                            }`}>
                              {tx.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-sm text-[#6a6a8a]">
                            {tx.recipient ? truncateAddress(tx.recipient) : "-"}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {tx.amount ? `${parseInt(tx.amount, 10) / 1_000_000} STX` : "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#6a6a8a]">
                            {tx.timestamp ? formatTimeAgo(tx.timestamp) : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <a
                              href={`https://explorer.stacks.co/txid/${tx.txid}?chain=mainnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#00f0ff] hover:underline text-sm"
                            >
                              View
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
