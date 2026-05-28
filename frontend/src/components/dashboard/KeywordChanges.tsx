"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TrendingUp, TrendingDown, Sparkles, XCircle, CircleDot, LayoutGrid, ArrowUp, ArrowDown, ExternalLink } from "lucide-react";

type ChangeItem = {
  query: string; status: string; substatus: string;
  clicks: number; impressions: number; ctr: number;
  position: number | null; prev_position: number | null;
  position_change: number | null; clicks_change: number;
};
type ChangesResponse = {
  has_data: boolean; reason?: string; period?: number;
  counts: Record<string, number>;
  items: ChangeItem[];
};

const PERIODS = [
  { value: 7, label: "7 jours" },
  { value: 28, label: "28 jours" },
  { value: 90, label: "90 jours" },
  { value: 180, label: "6 mois" },
];

const TABS = [
  { key: "all", label: "Tous", icon: LayoutGrid, color: "text-gray-700" },
  { key: "improved", label: "En hausse", icon: TrendingUp, color: "text-green-600" },
  { key: "declined", label: "En baisse", icon: TrendingDown, color: "text-red-600" },
  { key: "new", label: "Nouveaux", icon: Sparkles, color: "text-blue-600" },
  { key: "lost", label: "Perdus", icon: XCircle, color: "text-orange-600" },
  { key: "common", label: "Commun", icon: CircleDot, color: "text-violet-600" },
] as const;

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + "K";
  return new Intl.NumberFormat("fr-FR").format(n);
}

function shortDomain(siteId: string, query: string): string { return query; }

export function KeywordChanges({ siteId }: { siteId: string }) {
  const [period, setPeriod] = useState(28);
  const [tab, setTab] = useState<string>("all");

  const { data: countsData } = useQuery<ChangesResponse>({
    queryKey: ["kw-changes-counts", siteId, period],
    queryFn: async () => (await api.get(`/websites/${siteId}/keywords/changes?period=${period}&status=all&limit=1`)).data,
  });

  const { data, isLoading } = useQuery<ChangesResponse>({
    queryKey: ["kw-changes", siteId, period, tab],
    queryFn: async () => (await api.get(`/websites/${siteId}/keywords/changes?period=${period}&status=${tab}&limit=200`)).data,
  });

  const counts = countsData?.counts || {};

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold text-gray-900">Évolution des mots-clés (vs période précédente)</h3>
        <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 pt-3 flex-wrap border-b border-gray-100">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          const count = counts[t.key];
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                active ? "border-blue-600 text-blue-600 bg-blue-50/50" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              <Icon className={`w-3.5 h-3.5 ${active ? "text-blue-600" : t.color}`} />
              {t.label}
              {count !== undefined && <span className="text-xs text-gray-400">({fmt(count)})</span>}
            </button>
          );
        })}
      </div>

      {isLoading && <div className="p-10 text-center text-gray-400">Chargement…</div>}

      {!isLoading && data && !data.has_data && (
        <div className="p-6 bg-amber-50 text-amber-800 text-sm">
          <p className="font-semibold">Données GSC indisponibles</p>
          <p>{data.reason}</p>
        </div>
      )}

      {!isLoading && data?.has_data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Mot-clé</th>
                <th className="text-right px-3 py-2.5 font-semibold">Clics</th>
                <th className="text-right px-3 py-2.5 font-semibold">Δ Clics</th>
                <th className="text-right px-3 py-2.5 font-semibold">Impr.</th>
                <th className="text-right px-3 py-2.5 font-semibold">Position</th>
                <th className="text-right px-4 py-2.5 font-semibold">Δ Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.items.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Aucun mot-clé dans cette catégorie.</td></tr>
              )}
              {data.items.map((it) => (
                <tr key={`${it.query}-${it.status}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-900 max-w-xs truncate" title={it.query}>{it.query}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(it.clicks)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.clicks_change === 0 ? <span className="text-gray-400">—</span> : (
                      <span className={`inline-flex items-center gap-0.5 font-medium ${it.clicks_change > 0 ? "text-green-600" : "text-red-600"}`}>
                        {it.clicks_change > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {fmt(Math.abs(it.clicks_change))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(it.impressions)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.position === null ? <span className="text-gray-400">—</span> : it.position.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {it.position_change === null || it.position_change === 0 ? (
                      it.status === "new" ? <span className="text-blue-600 text-xs font-medium">nouveau</span>
                      : it.status === "lost" ? <span className="text-orange-600 text-xs font-medium">perdu</span>
                      : <span className="text-gray-400">—</span>
                    ) : (
                      <span className={`inline-flex items-center gap-0.5 font-medium ${it.position_change > 0 ? "text-green-600" : "text-red-600"}`}>
                        {it.position_change > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {Math.abs(it.position_change).toFixed(1)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
