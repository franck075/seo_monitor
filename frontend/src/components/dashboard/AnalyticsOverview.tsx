"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import { api } from "@/lib/api";
import { ArrowUp, ArrowDown, KeyRound, Search, FileText, Globe } from "lucide-react";

type Kpi = { current: number; previous: number; change_pct: number | null };
type MonthlyPoint = {
  month: string; label: string; clicks: number; impressions: number;
  is_projection: boolean;
  clicks_actual?: number; impressions_actual?: number;
  clicks_projected?: number; impressions_projected?: number;
};
type Overview = {
  has_data: boolean;
  reason?: string;
  period?: number;
  kpis?: {
    keywords_with_clicks: Kpi;
    keywords_visible: Kpi;
    pages_with_clicks: Kpi;
    pages_visible: Kpi;
  };
  monthly?: MonthlyPoint[];
};

type Site = { id: number; domain: string; display_name?: string };

const PERIODS = [
  { value: 28, label: "28 jours" },
  { value: 90, label: "3 mois" },
  { value: 180, label: "6 mois" },
];

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + " M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(".", ",") + " k";
  return new Intl.NumberFormat("fr-FR").format(n);
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined) return null;
  const up = pct > 0;
  const color = pct === 0 ? "text-gray-400" : up ? "text-green-600" : "text-red-600";
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      {pct !== 0 && <Icon className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

const KPI_DEFS = [
  { key: "keywords_with_clicks", label: "Mots-clés avec clics", icon: KeyRound, color: "text-blue-600", bg: "bg-blue-50" },
  { key: "keywords_visible", label: "Mots-clés visibles", icon: Search, color: "text-violet-600", bg: "bg-violet-50" },
  { key: "pages_with_clicks", label: "Pages avec clics", icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
  { key: "pages_visible", label: "Pages visibles", icon: Globe, color: "text-violet-600", bg: "bg-violet-50" },
] as const;

function MonthlyTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const p: MonthlyPoint = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900 mb-1">{p.label}{p.is_projection ? " (projection)" : ""}</p>
      {p.is_projection ? (
        <>
          <p className="text-blue-600">Clics réels : {fmt(p.clicks_actual)} → projeté {fmt(p.clicks_projected)}</p>
          <p className="text-violet-600">Impr. réelles : {fmt(p.impressions_actual)} → projeté {fmt(p.impressions_projected)}</p>
        </>
      ) : (
        <>
          <p className="text-blue-600">Clics : {fmt(p.clicks)}</p>
          <p className="text-violet-600">Impressions : {fmt(p.impressions)}</p>
        </>
      )}
    </div>
  );
}

export function AnalyticsOverview({ sites }: { sites: Site[] }) {
  const [siteId, setSiteId] = useState<number | null>(sites[0]?.id ?? null);
  const [period, setPeriod] = useState(28);

  const { data, isLoading } = useQuery<Overview>({
    queryKey: ["analytics-overview", siteId, period],
    queryFn: async () => (await api.get(`/websites/${siteId}/analytics/overview?period=${period}`)).data,
    enabled: !!siteId,
  });

  // For the chart: projected month uses actual value for the solid bar; we add a
  // separate "projection delta" series to render the lighter projected portion.
  const chartData = (data?.monthly || []).map((m) => {
    if (m.is_projection) {
      return {
        ...m,
        clicks_solid: m.clicks_actual ?? 0,
        clicks_proj: Math.max((m.clicks_projected ?? 0) - (m.clicks_actual ?? 0), 0),
        impressions_solid: m.impressions_actual ?? 0,
        impressions_proj: Math.max((m.impressions_projected ?? 0) - (m.impressions_actual ?? 0), 0),
      };
    }
    return {
      ...m,
      clicks_solid: m.clicks,
      clicks_proj: 0,
      impressions_solid: m.impressions,
      impressions_proj: 0,
    };
  });

  if (!sites.length) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-900">Analytics Search Console</h2>
        <div className="flex items-center gap-2">
          <select
            value={siteId ?? ""}
            onChange={(e) => setSiteId(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white max-w-[200px]"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.display_name || s.domain}</option>
            ))}
          </select>
          <select
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {isLoading && <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">Chargement…</div>}

      {!isLoading && data && !data.has_data && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-800 text-sm">
          <p className="font-semibold">Données GSC indisponibles</p>
          <p>{data.reason || "Configurez Google Search Console pour ce site."}</p>
        </div>
      )}

      {!isLoading && data?.has_data && data.kpis && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {KPI_DEFS.map(({ key, label, icon: Icon, color, bg }) => {
              const k = data.kpis![key];
              return (
                <div key={key} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                  <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className={`text-3xl font-bold ${color}`}>{fmt(k.current)}</p>
                    <ChangeBadge pct={k.change_pct} />
                  </div>
                  <p className="text-xs font-medium text-gray-700 mt-1">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">vs période précédente : {fmt(k.previous)}</p>
                </div>
              );
            })}
          </div>

          {chartData.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Performance mensuelle</h3>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#60a5fa" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#8b5cf6" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
                  <Tooltip content={<MonthlyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {/* Clicks (left axis) */}
                  <Bar yAxisId="left" dataKey="clicks_solid" stackId="clicks" name="Clics" fill="#60a5fa" radius={[0, 0, 0, 0]} />
                  <Bar yAxisId="left" dataKey="clicks_proj" stackId="clicks" name="Clics (projection)" fill="#bfdbfe" radius={[3, 3, 0, 0]} />
                  {/* Impressions (right axis) */}
                  <Bar yAxisId="right" dataKey="impressions_solid" stackId="impr" name="Impressions" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
                  <Bar yAxisId="right" dataKey="impressions_proj" stackId="impr" name="Impr. (projection)" fill="#ddd6fe" radius={[3, 3, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
