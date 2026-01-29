"use client";

import { useEffect, useState, useCallback } from "react";

interface AnalyticsData {
  prospectsByDay: { date: string; count: number }[];
  airdropsByDay: { date: string; count: number; total_sats: number }[];
  dailyLimits: { date: string; prs_opened: number; airdrops_sent: number }[];
  funnel: {
    total: number;
    qualified: number;
    contacted: number;
    verified: number;
    airdropped: number;
  };
  tierDistribution: { tier: string; count: number }[];
}

const API_URL = "https://appleseed-api.c3dar.workers.dev";

const tierColors: Record<string, string> = {
  A: "#00ff88",
  B: "#00f0ff",
  C: "#ffcc00",
  D: "#6a6a8a",
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Demo data
  const demoData: AnalyticsData = {
    prospectsByDay: Array.from({ length: 14 }, (_, i) => ({
      date: new Date(Date.now() - (13 - i) * 86400000).toISOString().split("T")[0],
      count: Math.floor(Math.random() * 30) + 5,
    })),
    airdropsByDay: Array.from({ length: 14 }, (_, i) => ({
      date: new Date(Date.now() - (13 - i) * 86400000).toISOString().split("T")[0],
      count: Math.floor(Math.random() * 5),
      total_sats: Math.floor(Math.random() * 50000),
    })),
    dailyLimits: [],
    funnel: { total: 337, qualified: 245, contacted: 89, verified: 34, airdropped: 12 },
    tierDistribution: [
      { tier: "A", count: 45 },
      { tier: "B", count: 89 },
      { tier: "C", count: 134 },
      { tier: "D", count: 69 },
    ],
  };

  const displayData = data?.funnel?.total ? data : demoData;
  const isDemo = !data?.funnel?.total && !loading;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {isDemo && (
        <div className="mx-4 md:mx-8 mt-6 p-3 bg-[#ffcc00]/10 border border-[#ffcc00]/30 rounded-lg text-center">
          <span className="text-sm text-[#ffcc00]">Demo Data - Real analytics will appear with live data</span>
        </div>
      )}
      <div className="px-4 md:px-8 py-6">
        {loading ? (
          <div className="text-center py-12 text-[#6a6a8a]">Loading analytics...</div>
        ) : (
          <>
            {/* Conversion Funnel */}
            <section className="mb-10">
              <h2 className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-4">
                Conversion Funnel
              </h2>
              <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-6">
                <FunnelChart funnel={displayData.funnel} />
              </div>
            </section>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
              {/* Prospects Over Time */}
              <section>
                <h2 className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-4">
                  Prospects Discovered (Last 14 Days)
                </h2>
                <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-6">
                  <BarChart data={displayData.prospectsByDay} color="#00f0ff" />
                </div>
              </section>

              {/* Airdrops Over Time */}
              <section>
                <h2 className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-4">
                  Airdrops Sent (Last 14 Days)
                </h2>
                <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-6">
                  <BarChart
                    data={displayData.airdropsByDay.map((d) => ({ date: d.date, count: d.count }))}
                    color="#f7931a"
                  />
                </div>
              </section>
            </div>

            {/* Tier Distribution */}
            <section>
              <h2 className="text-sm text-[#6a6a8a] uppercase tracking-wider mb-4">
                Tier Distribution
              </h2>
              <div className="bg-[#0d0d14] border border-[#1a1a2e] rounded-lg p-6">
                <TierPieChart data={displayData.tierDistribution} />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function FunnelChart({ funnel }: { funnel: AnalyticsData["funnel"] }) {
  const stages = [
    { label: "Discovered", value: funnel.total, color: "#6a6a8a" },
    { label: "Qualified", value: funnel.qualified, color: "#00f0ff" },
    { label: "Contacted", value: funnel.contacted, color: "#ffcc00" },
    { label: "Verified", value: funnel.verified, color: "#00ff88" },
    { label: "Airdropped", value: funnel.airdropped, color: "#f7931a" },
  ];

  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="space-y-4">
      {stages.map((stage, i) => {
        const width = (stage.value / maxValue) * 100;
        const prevValue = i > 0 ? stages[i - 1].value : stage.value;
        const convRate = prevValue > 0 ? ((stage.value / prevValue) * 100).toFixed(0) : "100";

        return (
          <div key={stage.label}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium" style={{ color: stage.color }}>
                  {stage.label}
                </span>
                {i > 0 && (
                  <span className="text-xs text-[#6a6a8a]">({convRate}% from previous)</span>
                )}
              </div>
              <span className="text-lg font-bold">{stage.value.toLocaleString()}</span>
            </div>
            <div className="h-8 bg-[#1a1a2e] rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500 flex items-center justify-end pr-2"
                style={{
                  width: `${Math.max(width, 5)}%`,
                  backgroundColor: stage.color,
                }}
              >
                {width > 15 && (
                  <span className="text-xs font-medium text-black">{width.toFixed(0)}%</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BarChart({ data, color }: { data: { date: string; count: number }[]; color: string }) {
  const maxValue = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div>
      <div className="flex items-end justify-between h-40 gap-1">
        {data.map((d) => {
          const height = (d.count / maxValue) * 100;
          return (
            <div
              key={d.date}
              className="flex-1 group relative"
            >
              <div
                className="w-full rounded-t transition-all duration-300 hover:opacity-80"
                style={{
                  height: `${Math.max(height, 2)}%`,
                  backgroundColor: color,
                }}
              />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1a1a2e] rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {d.count} on {d.date}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-[#6a6a8a]">
        <span>{data[0]?.date.slice(5)}</span>
        <span>Total: {total}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

function TierPieChart({ data }: { data: { tier: string; count: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) {
    return <div className="text-center text-[#6a6a8a] py-8">No data</div>;
  }

  let currentAngle = 0;

  return (
    <div className="flex items-center justify-center gap-12">
      {/* Pie Chart */}
      <svg viewBox="0 0 100 100" className="w-48 h-48">
        {data.map((d) => {
          const percentage = d.count / total;
          const angle = percentage * 360;
          const startAngle = currentAngle;
          currentAngle += angle;

          const x1 = 50 + 40 * Math.cos((Math.PI * (startAngle - 90)) / 180);
          const y1 = 50 + 40 * Math.sin((Math.PI * (startAngle - 90)) / 180);
          const x2 = 50 + 40 * Math.cos((Math.PI * (startAngle + angle - 90)) / 180);
          const y2 = 50 + 40 * Math.sin((Math.PI * (startAngle + angle - 90)) / 180);
          const largeArc = angle > 180 ? 1 : 0;

          return (
            <path
              key={d.tier}
              d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={tierColors[d.tier] || "#6a6a8a"}
              className="hover:opacity-80 transition-opacity"
            />
          );
        })}
        <circle cx="50" cy="50" r="20" fill="#0d0d14" />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="8" fontWeight="bold">
          {total}
        </text>
      </svg>

      {/* Legend */}
      <div className="space-y-3">
        {data.map((d) => {
          const percentage = ((d.count / total) * 100).toFixed(0);
          return (
            <div key={d.tier} className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: tierColors[d.tier] || "#6a6a8a" }}
              />
              <div>
                <div className="text-sm font-medium">Tier {d.tier}</div>
                <div className="text-xs text-[#6a6a8a]">
                  {d.count} ({percentage}%)
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
