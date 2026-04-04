"use client";
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from "recharts";
import { VitalsBadge } from "@/components/cards/VitalsBadge";

interface VitalsGaugeChartProps {
  score: number;
  lcp?: number;
  cls?: number;
  inp?: number;
  lcp_rating?: string;
  cls_rating?: string;
  inp_rating?: string;
}

export function VitalsGaugeChart({ score, lcp, cls, inp, lcp_rating, cls_rating, inp_rating }: VitalsGaugeChartProps) {
  const color = score >= 90 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  const data = [{ name: "Score", value: score, fill: color }];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Core Web Vitals</h3>
      <div className="flex items-center gap-6">
        <div className="w-32 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="80%" data={data}>
              <RadialBar dataKey="value" cornerRadius={10} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2">
          <p className="text-3xl font-bold" style={{ color }}>{score}</p>
          {lcp !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-12">LCP</span>
              <span className="font-medium">{lcp ? `${(lcp / 1000).toFixed(2)}s` : "—"}</span>
              {lcp_rating && <VitalsBadge rating={lcp_rating} />}
            </div>
          )}
          {cls !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-12">CLS</span>
              <span className="font-medium">{cls?.toFixed(3) ?? "—"}</span>
              {cls_rating && <VitalsBadge rating={cls_rating} />}
            </div>
          )}
          {inp !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-12">INP</span>
              <span className="font-medium">{inp ? `${inp}ms` : "—"}</span>
              {inp_rating && <VitalsBadge rating={inp_rating} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
