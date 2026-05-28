"use client";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { api } from "@/lib/api";
import { MousePointerClick, Eye, Percent, Search } from "lucide-react";

type Segment = { clicks: number; impressions: number; queries: number; ctr: number };
type Evo = { week: string; branded: number; non_branded: number };
type Branded = {
  has_data: boolean;
  reason?: string;
  brand_terms?: string[];
  total_clicks?: number;
  branded_pct?: number;
  non_branded_pct?: number;
  branded?: Segment;
  non_branded?: Segment;
  evolution?: Evo[];
};

const BRAND_COLOR = "#f59e0b";
const NONBRAND_COLOR = "#8b5cf6";

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + " M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(".", ",") + " K";
  return new Intl.NumberFormat("fr-FR").format(n);
}

function SegmentPanel({ title, color, seg }: { title: string; color: string; seg: Segment }) {
  const rows = [
    { icon: MousePointerClick, label: "Clics", value: fmt(seg.clicks) },
    { icon: Eye, label: "Impressions", value: fmt(seg.impressions) },
    { icon: Percent, label: "CTR", value: `${seg.ctr.toFixed(2)}%` },
    { icon: Search, label: "Requêtes", value: fmt(seg.queries) },
  ];
  return (
    <div className="rounded-xl overflow-hidden border border-gray-100">
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: `${color}1a` }}>
        <span className="inline-flex items-center gap-2 font-semibold" style={{ color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: color }} /> {title}
        </span>
      </div>
      <div className="divide-y divide-gray-50">
        {rows.map((r) => (
          <div key={r.label} className="px-4 py-2 flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 text-gray-500">
              <r.icon className="w-3.5 h-3.5" /> {r.label}
            </span>
            <span className="font-semibold text-gray-900">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsBranded({ siteId }: { siteId: number | null }) {
  const { data, isLoading } = useQuery<Branded>({
    queryKey: ["analytics-branded", siteId],
    queryFn: async () => (await api.get(`/websites/${siteId}/analytics/branded?period=180`)).data,
    enabled: !!siteId,
  });

  if (!siteId) return null;
  if (isLoading) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">Chargement…</div>;
  }
  if (!data?.has_data || !data.branded || !data.non_branded) {
    return data && !data.has_data ? (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-sm text-gray-500">
        Branded vs Non-Branded indisponible : {data.reason}
      </div>
    ) : null;
  }

  const pieData = [
    { name: "Non-Branded", value: data.non_branded.clicks, color: NONBRAND_COLOR },
    { name: "Branded", value: data.branded.clicks, color: BRAND_COLOR },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
      <div>
        <h3 className="font-semibold text-gray-900">Trafic Branded vs Non-Branded</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Analyse de la répartition du trafic de marque
          {data.brand_terms && data.brand_terms.length > 0 && (
            <span className="text-gray-400"> · termes : {data.brand_terms.join(", ")}</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
        {/* Donut */}
        <div className="relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" innerRadius={60} outerRadius={90} paddingAngle={2} startAngle={90} endAngle={-270}>
                {pieData.map((e) => <Cell key={e.name} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-gray-900">{fmt(data.total_clicks)}</span>
            <span className="text-xs text-gray-400">clics totaux</span>
          </div>
        </div>

        {/* Branded panel */}
        <div>
          <div className="text-right mb-2">
            <span className="text-2xl font-bold" style={{ color: BRAND_COLOR }}>{data.branded_pct}%</span>
            <span className="text-sm text-gray-400 ml-1">Branded</span>
          </div>
          <SegmentPanel title="Branded" color={BRAND_COLOR} seg={data.branded} />
        </div>

        {/* Non-Branded panel */}
        <div>
          <div className="text-right mb-2">
            <span className="text-2xl font-bold" style={{ color: NONBRAND_COLOR }}>{data.non_branded_pct}%</span>
            <span className="text-sm text-gray-400 ml-1">Non-Branded</span>
          </div>
          <SegmentPanel title="Non-Branded" color={NONBRAND_COLOR} seg={data.non_branded} />
        </div>
      </div>

      {data.evolution && data.evolution.length > 1 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Évolution temporelle (clics, par semaine)</h4>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.evolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={20} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="branded" stroke={BRAND_COLOR} fill={`${BRAND_COLOR}33`} name="Branded" />
              <Area type="monotone" dataKey="non_branded" stroke={NONBRAND_COLOR} fill={`${NONBRAND_COLOR}33`} name="Non-Branded" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
