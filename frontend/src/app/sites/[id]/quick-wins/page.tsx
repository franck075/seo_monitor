"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { Sparkles, ExternalLink, Check, X, Search, ChevronDown, ChevronUp, Eye } from "lucide-react";

type Catalog = {
  quick_wins: { id: string; title: string; summary: string; recommendations: string[] }[];
};

type TopQuery = { query: string; impressions: number; clicks: number; position: number };
type Position4_15Item = {
  page: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  top_query: TopQuery;
  google_search_url: string;
  title: string | null;
  h1: string | null;
  query_in_title: boolean;
  query_in_h1: boolean;
};
type Position4_15Response = {
  has_data: boolean;
  reason?: string;
  period?: number;
  items: Position4_15Item[];
  total_candidates?: number;
};

const PERIODS = [
  { value: 7, label: "7 jours" },
  { value: 28, label: "28 jours" },
  { value: 90, label: "3 mois" },
  { value: 180, label: "6 mois" },
];

function fmt(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}

function shortenUrl(u: string): string {
  try { return new URL(u).pathname; } catch { return u; }
}

function CheckBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
      ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
    }`}>
      {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </span>
  );
}

function Position4_15Card({ siteId }: { siteId: string }) {
  const [period, setPeriod] = useState(28);
  const [open, setOpen] = useState(true);

  const { data, isLoading } = useQuery<Position4_15Response>({
    queryKey: ["qw-position-4-15", siteId, period],
    queryFn: async () =>
      (await api.get(`/websites/${siteId}/quick-wins/position-4-15?period=${period}`)).data,
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">
                <Sparkles className="w-3 h-3" /> Quick Win #1
              </span>
              {data?.has_data && data.total_candidates !== undefined && (
                <span className="text-xs text-gray-500">
                  {data.total_candidates} page{data.total_candidates > 1 ? "s" : ""} concernée{data.total_candidates > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900">Pages en position 4–15 — opportunités les plus rentables</h3>
            <p className="text-sm text-gray-500 mt-1">
              Vos pages qui se classent entre la position 4 et 15 sont à portée du Top 3 de Google.
              Un petit gain de pertinence peut multiplier leur trafic par 3 à 5.
            </p>
          </div>
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        <button onClick={() => setOpen(!open)}
          className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {open ? "Masquer" : "Afficher"} les recommandations
        </button>

        {open && (
          <ol className="mt-3 space-y-1.5 text-sm text-gray-700 list-decimal list-inside pl-1">
            <li>Identifiez la <b>requête principale</b> de chaque page (colonne « Requête » ci-dessous).</li>
            <li>Vérifiez qu'elle apparaît dans le <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">&lt;title&gt;</code> et le <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">&lt;H1&gt;</code> (badges sur chaque ligne).</li>
            <li>Cliquez sur l'icône <Search className="w-3 h-3 inline" /> pour analyser les 3 premiers résultats Google sur cette requête.</li>
            <li>Ajoutez à votre page le contenu manquant identifié.</li>
            <li>Republiez puis demandez l'indexation dans Google Search Console.</li>
          </ol>
        )}
      </div>

      {isLoading && <div className="p-8 text-center text-gray-400">Chargement…</div>}

      {!isLoading && data && !data.has_data && (
        <div className="p-5 bg-amber-50 border-t border-amber-200 text-amber-800 text-sm">
          <p className="font-semibold">Données GSC indisponibles</p>
          <p>{data.reason || "Configurez Google Search Console pour ce site."}</p>
        </div>
      )}

      {!isLoading && data?.has_data && data.items.length === 0 && (
        <div className="p-8 text-center text-gray-500 text-sm">
          Aucune page actuellement entre les positions 4 et 15 avec suffisamment d'impressions.
        </div>
      )}

      {!isLoading && data?.has_data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Page</th>
                <th className="text-left px-3 py-3 font-semibold">Requête principale</th>
                <th className="text-right px-3 py-3 font-semibold">Position</th>
                <th className="text-right px-3 py-3 font-semibold">Impressions</th>
                <th className="text-right px-3 py-3 font-semibold">Clics</th>
                <th className="text-left px-3 py-3 font-semibold">Vérifs</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((it) => (
                <tr key={it.page} className="hover:bg-gray-50">
                  <td className="px-4 py-3 max-w-xs">
                    <a href={it.page} target="_blank" rel="noopener"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1 truncate"
                      title={it.page}>
                      <span className="truncate">{shortenUrl(it.page)}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </td>
                  <td className="px-3 py-3 max-w-xs">
                    <div className="font-medium text-gray-900 truncate" title={it.top_query.query}>{it.top_query.query}</div>
                    <div className="text-xs text-gray-400">{fmt(it.top_query.impressions)} impressions</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold">{it.position.toFixed(1)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(it.impressions)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(it.clicks)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      <CheckBadge ok={it.query_in_title} label="Title" />
                      <CheckBadge ok={it.query_in_h1} label="H1" />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <a href={it.google_search_url} target="_blank" rel="noopener"
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50"
                        title="Analyser la SERP Google">
                        <Search className="w-3 h-3" />
                      </a>
                      <Link
                        href={`/sites/${siteId}/page-details?url=${encodeURIComponent(it.page)}&period=${period}`}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50"
                        title="Voir les détails de la page"
                      >
                        <Eye className="w-3 h-3" />
                      </Link>
                    </div>
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

export default function QuickWinsPage({ params }: { params: { id: string } }) {
  const id = params.id;
  useQuery<Catalog>({
    queryKey: ["qw-catalog", id],
    queryFn: async () => (await api.get(`/websites/${id}/quick-wins`)).data,
  });

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <TopNav title="Quick Wins SEO" />
        <main className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-blue-600" /> Quick Wins SEO
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Opportunités d'optimisation à fort impact, détectées à partir de vos données Search Console.
            </p>
          </div>

          <Position4_15Card siteId={id} />
        </main>
      </div>
    </div>
  );
}
