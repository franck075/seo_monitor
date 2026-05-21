"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { ArrowUp, ArrowDown, ExternalLink, Eye } from "lucide-react";

type PageRow = {
  page: string;
  impressions: number; clicks: number; ctr: number; position: number;
  prev_impressions: number; prev_clicks: number; prev_ctr: number; prev_position: number;
  impressions_change: number; clicks_change: number; ctr_change: number; position_change: number;
  impressions_change_pct: number | null; clicks_change_pct: number | null;
};

type TopPagesResponse = {
  has_data: boolean;
  reason?: string;
  period?: number;
  current_range?: { start: string; end: string };
  previous_range?: { start: string; end: string };
  top_performers?: PageRow[];
  winners?: PageRow[];
  losers?: PageRow[];
  total_pages?: number;
};

const PERIODS = [
  { value: 7, label: "7 derniers jours" },
  { value: 28, label: "28 derniers jours" },
  { value: 90, label: "3 derniers mois" },
  { value: 180, label: "6 derniers mois" },
  { value: 365, label: "12 derniers mois" },
];

const TABS = [
  { key: "top_performers", label: "Top performers" },
  { key: "winners", label: "Gagnants" },
  { key: "losers", label: "Perdants" },
] as const;

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("fr-FR").format(n);
}

function Change({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || value === undefined || value === 0) return <span className="text-gray-400">—</span>;
  const positive = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUp : ArrowDown;
  const color = positive ? "text-green-600" : "text-red-600";
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(value).toFixed(value % 1 === 0 ? 0 : 1)}
    </span>
  );
}

function ChangePct({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  const positive = invert ? value < 0 : value > 0;
  const color = positive ? "text-green-600" : value === 0 ? "text-gray-500" : "text-red-600";
  const sign = value > 0 ? "+" : "";
  return <span className={`font-medium ${color}`}>{sign}{value.toFixed(1)}%</span>;
}

function shortenUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.pathname + (url.search || "");
  } catch {
    return u;
  }
}

export default function TopPagesPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [period, setPeriod] = useState(28);
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("top_performers");
  const [sortBy, setSortBy] = useState<keyof PageRow>("clicks");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery<TopPagesResponse>({
    queryKey: ["top-pages", id, period],
    queryFn: async () => (await api.get(`/websites/${id}/pages/top?period=${period}`)).data,
  });

  const rows: PageRow[] = data?.[tab] || [];
  const sortedRows = [...rows].sort((a, b) => {
    const va = a[sortBy] ?? 0; const vb = b[sortBy] ?? 0;
    if (typeof va === "number" && typeof vb === "number") {
      return sortDir === "desc" ? vb - va : va - vb;
    }
    return 0;
  });

  function handleSort(col: keyof PageRow) {
    if (sortBy === col) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <TopNav title="Top pages" />
        <main className="p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Pages les plus performantes</h1>
              <p className="text-sm text-gray-500 mt-1">
                Comparaison de chaque URL avec la période précédente.
                {data?.current_range && (
                  <span className="ml-2 text-gray-400">
                    {data.current_range.start} → {data.current_range.end}
                    {data.previous_range && ` (vs ${data.previous_range.start} → ${data.previous_range.end})`}
                  </span>
                )}
              </p>
            </div>
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div className="flex gap-2 border-b border-gray-200">
            {TABS.map((t) => {
              const count = data?.[t.key]?.length || 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    tab === t.key
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t.label}
                  <span className="ml-1.5 text-xs text-gray-400">({count})</span>
                </button>
              );
            })}
          </div>

          {isLoading && <div className="text-center py-12 text-gray-400">Chargement…</div>}

          {!isLoading && data && !data.has_data && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800 text-sm">
              <p className="font-semibold mb-1">Données GSC indisponibles</p>
              <p>{data.reason || "Configurez Google Search Console pour ce site dans les paramètres."}</p>
            </div>
          )}

          {!isLoading && data?.has_data && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Page</th>
                      {[
                        { key: "impressions", label: "Impressions" },
                        { key: "impressions_change_pct", label: "Variation" },
                        { key: "clicks", label: "Clics" },
                        { key: "clicks_change_pct", label: "Variation" },
                        { key: "ctr", label: "CTR" },
                        { key: "ctr_change", label: "Variation" },
                        { key: "position", label: "Position" },
                        { key: "position_change", label: "Variation" },
                      ].map((c) => (
                        <th key={c.key}
                          onClick={() => handleSort(c.key as keyof PageRow)}
                          className="text-right px-3 py-3 font-semibold cursor-pointer hover:bg-gray-100 select-none">
                          {c.label}
                          {sortBy === c.key && <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>}
                        </th>
                      ))}
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedRows.length === 0 && (
                      <tr><td colSpan={10} className="text-center py-8 text-gray-400">Aucune page dans cette catégorie.</td></tr>
                    )}
                    {sortedRows.map((r) => (
                      <tr key={r.page} className="hover:bg-gray-50">
                        <td className="px-4 py-3 max-w-md">
                          <a href={r.page} target="_blank" rel="noopener"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1 truncate"
                            title={r.page}>
                            <span className="truncate">{shortenUrl(r.page)}</span>
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{fmt(r.impressions)}</td>
                        <td className="px-3 py-3 text-right tabular-nums"><ChangePct value={r.impressions_change_pct} /></td>
                        <td className="px-3 py-3 text-right tabular-nums">{fmt(r.clicks)}</td>
                        <td className="px-3 py-3 text-right tabular-nums"><ChangePct value={r.clicks_change_pct} /></td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.ctr.toFixed(1)}%</td>
                        <td className="px-3 py-3 text-right tabular-nums"><Change value={r.ctr_change} /></td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.position.toFixed(1)}</td>
                        <td className="px-3 py-3 text-right tabular-nums"><Change value={r.position_change} invert /></td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            href={`/sites/${id}/page-details?url=${encodeURIComponent(r.page)}&period=${period}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300"
                          >
                            <Eye className="w-3 h-3" />
                            Détails
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
