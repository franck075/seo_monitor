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

type LowCtrItem = {
  page: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  top_query: TopQuery & { ctr: number };
  google_search_url: string;
  title: string | null;
  meta_description: string | null;
  query_in_title: boolean;
};
type LowCtrResponse = {
  has_data: boolean;
  reason?: string;
  period?: number;
  items: LowCtrItem[];
  total_candidates?: number;
};

function LowCtrCard({ siteId }: { siteId: string }) {
  const [period, setPeriod] = useState(28);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<LowCtrResponse>({
    queryKey: ["qw-low-ctr", siteId, period],
    queryFn: async () =>
      (await api.get(`/websites/${siteId}/quick-wins/low-ctr-high-impressions?period=${period}`)).data,
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">
                <Sparkles className="w-3 h-3" /> Quick Win #2
              </span>
              {data?.has_data && data.total_candidates !== undefined && (
                <span className="text-xs text-gray-500">
                  {data.total_candidates} page{data.total_candidates > 1 ? "s" : ""} concernée{data.total_candidates > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900">Pages avec beaucoup d'impressions mais peu de clics</h3>
            <p className="text-sm text-gray-500 mt-1">
              Ces pages apparaissent dans Google mais leur <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">&lt;title&gt;</code> n'attire pas les clics.
              Le réécrire peut multiplier le trafic à positions équivalentes — sans toucher au contenu.
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
            <li>Identifiez la <b>requête principale</b> de chaque page (colonne ci-dessous).</li>
            <li>Lisez le <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">&lt;title&gt;</code> actuel (colonne « Title actuel »).</li>
            <li>Cliquez sur <Search className="w-3 h-3 inline" /> pour comparer avec les titres des 3 premiers résultats Google.</li>
            <li>Réécrivez le title : <b>mot-clé principal en début</b> + un chiffre, une date ou un hook (ex. « 2026 », « guide complet », « en 5 minutes »).</li>
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
          Aucune page avec un CTR &lt; 3% et plus de 100 impressions sur cette période. C'est plutôt bon signe !
        </div>
      )}

      {!isLoading && data?.has_data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Page</th>
                <th className="text-left px-3 py-3 font-semibold">Requête principale</th>
                <th className="text-left px-3 py-3 font-semibold">Title actuel</th>
                <th className="text-right px-3 py-3 font-semibold">Impressions</th>
                <th className="text-right px-3 py-3 font-semibold">CTR</th>
                <th className="text-right px-3 py-3 font-semibold">Position</th>
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
                  <td className="px-3 py-3 max-w-xs">
                    <div className="text-xs text-gray-700 line-clamp-2" title={it.title || ""}>
                      {it.title || <span className="text-gray-400 italic">Non collecté</span>}
                    </div>
                    {it.title && (
                      <div className="mt-1">
                        <CheckBadge ok={it.query_in_title} label="Requête dans title" />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(it.impressions)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className="font-semibold text-red-600">{it.ctr.toFixed(2)}%</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{it.position.toFixed(1)}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <a href={it.google_search_url} target="_blank" rel="noopener"
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50"
                        title="Comparer avec les titres en SERP">
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

type Top3Item = {
  page: string; query: string; position: number;
  impressions: number; clicks: number; ctr: number;
  google_search_url: string;
};
type Top3SourcePage = { page: string; clicks: number; impressions: number };
type Top3Response = {
  has_data: boolean; reason?: string; period?: number;
  items: Top3Item[]; total_candidates?: number;
  source_pages: Top3SourcePage[];
};

type ZeroTrafficItem = {
  page: string;
  title: string | null;
  h1: string | null;
  status_code: number | null;
  last_seen_snapshot: string | null;
  last_http_check: string | null;
};
type ZeroTrafficResponse = {
  has_data: boolean; reason?: string; period?: number;
  items: ZeroTrafficItem[];
  total_candidates?: number;
  sitemap_total_urls?: number;
  sitemap_recorded_at?: string;
};

type Top3LowCtrItem = {
  page: string; query: string; position: number;
  impressions: number; clicks: number; ctr: number;
  google_search_url: string;
  title: string | null;
  meta_description: string | null;
};
type Top3LowCtrResponse = {
  has_data: boolean; reason?: string; period?: number;
  items: Top3LowCtrItem[]; total_candidates?: number;
};

function Top3LowCtrCard({ siteId }: { siteId: string }) {
  const [period, setPeriod] = useState(28);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<Top3LowCtrResponse>({
    queryKey: ["qw-top-3-low-ctr", siteId, period],
    queryFn: async () =>
      (await api.get(`/websites/${siteId}/quick-wins/top-3-low-ctr?period=${period}`)).data,
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">
                <Sparkles className="w-3 h-3" /> Quick Win #5
              </span>
              {data?.has_data && data.total_candidates !== undefined && (
                <span className="text-xs text-gray-500">
                  {data.total_candidates} requête{data.total_candidates > 1 ? "s" : ""} en Top 3 sous-cliquée{data.total_candidates > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900">Requêtes Top 3 « presque cliquées » — problème de snippet</h3>
            <p className="text-sm text-gray-500 mt-1">
              Vous êtes en position 1, 2 ou 3 mais le CTR est inférieur à 5%. Ce n'est pas votre position,
              c'est votre <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">&lt;title&gt;</code> ou
              votre meta description qui n'attire pas le clic.
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
            <li>Cliquez sur <Search className="w-3 h-3 inline" /> pour voir la SERP Google : regardez les snippets des concurrents qui passent devant vous.</li>
            <li>Identifiez ce qui rend leur snippet plus cliquable : un <b>chiffre</b>, une <b>promesse</b>, un <b>hook</b>, une <b>urgence</b>.</li>
            <li>Réécrivez votre <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">&lt;title&gt;</code> avec un hook fort en début (ex : « 2026 », « guide complet », « à partir de 5M CFA »).</li>
            <li>Réécrivez la meta description en intégrant l'intention de recherche + un appel à l'action.</li>
            <li>Republiez, demandez l'indexation dans GSC, et comparez le CTR <b>2 semaines plus tard</b>.</li>
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
          🎉 Aucune requête en Top 3 avec un CTR inférieur à 5%. Vos snippets fonctionnent.
        </div>
      )}

      {!isLoading && data?.has_data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Requête</th>
                <th className="text-left px-3 py-3 font-semibold">Page · Snippet actuel</th>
                <th className="text-right px-3 py-3 font-semibold">Position</th>
                <th className="text-right px-3 py-3 font-semibold">Impr.</th>
                <th className="text-right px-3 py-3 font-semibold">Clics</th>
                <th className="text-right px-3 py-3 font-semibold">CTR</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((it, i) => (
                <tr key={`${it.page}-${it.query}-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 max-w-xs">
                    <div className="font-medium text-gray-900 truncate" title={it.query}>{it.query}</div>
                  </td>
                  <td className="px-3 py-3 max-w-md">
                    <a href={it.page} target="_blank" rel="noopener"
                      className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1 truncate"
                      title={it.page}>
                      <span className="truncate">{shortenUrl(it.page)}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                    {it.title && (
                      <div className="text-xs text-gray-700 mt-1 line-clamp-1" title={it.title}>
                        <span className="font-medium">Title:</span> {it.title}
                      </div>
                    )}
                    {it.meta_description && (
                      <div className="text-xs text-gray-500 line-clamp-1" title={it.meta_description}>
                        <span className="font-medium">Meta:</span> {it.meta_description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-green-600">{it.position.toFixed(1)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(it.impressions)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(it.clicks)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className="font-semibold text-red-600">{it.ctr.toFixed(2)}%</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <a href={it.google_search_url} target="_blank" rel="noopener"
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50"
                        title="Voir la SERP Google pour comparer les snippets">
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

function ZeroTrafficCard({ siteId }: { siteId: string }) {
  const [period, setPeriod] = useState(90);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<ZeroTrafficResponse>({
    queryKey: ["qw-zero-traffic", siteId, period],
    queryFn: async () =>
      (await api.get(`/websites/${siteId}/quick-wins/zero-traffic-pages?period=${period}`)).data,
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">
                <Sparkles className="w-3 h-3" /> Quick Win #4
              </span>
              {data?.has_data && data.total_candidates !== undefined && (
                <span className="text-xs text-gray-500">
                  {data.total_candidates} page{data.total_candidates > 1 ? "s" : ""} sans trafic
                  {data.sitemap_total_urls ? ` sur ${data.sitemap_total_urls} indexée${data.sitemap_total_urls > 1 ? "s" : ""}` : ""}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900">Pages indexées sans trafic — à optimiser ou supprimer</h3>
            <p className="text-sm text-gray-500 mt-1">
              Ces pages sont dans votre sitemap mais n'ont reçu aucune impression Google sur la période.
              Elles diluent votre budget de crawl : optimisez-les ou supprimez-les avec une 301.
            </p>
          </div>
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value={30}>30 jours</option>
            <option value={90}>90 jours</option>
            <option value={180}>6 mois</option>
            <option value={365}>12 mois</option>
          </select>
        </div>

        <button onClick={() => setOpen(!open)}
          className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {open ? "Masquer" : "Afficher"} les recommandations
        </button>

        {open && (
          <ol className="mt-3 space-y-1.5 text-sm text-gray-700 list-decimal list-inside pl-1">
            <li>Pour chaque page : déterminez si elle vise une <b>intention de recherche réelle</b>.</li>
            <li><b>Si oui</b> → optimisez (title, H1, contenu, maillage interne) en visant un mot-clé spécifique.</li>
            <li><b>Si non</b> → supprimez-la et mettez en place une <b>redirection 301</b> vers la page la plus proche thématiquement.</li>
            <li>Mettez à jour le sitemap pour ne plus lister les pages supprimées.</li>
            <li>Demandez la mise à jour de l'indexation dans Google Search Console.</li>
          </ol>
        )}

        {data?.sitemap_recorded_at && (
          <p className="mt-3 text-xs text-gray-400">
            Comparaison basée sur le sitemap collecté le {new Date(data.sitemap_recorded_at).toLocaleDateString("fr-FR")}.
          </p>
        )}
      </div>

      {isLoading && <div className="p-8 text-center text-gray-400">Chargement…</div>}

      {!isLoading && data && !data.has_data && (
        <div className="p-5 bg-amber-50 border-t border-amber-200 text-amber-800 text-sm">
          <p className="font-semibold">Données indisponibles</p>
          <p>{data.reason}</p>
        </div>
      )}

      {!isLoading && data?.has_data && data.items.length === 0 && (
        <div className="p-8 text-center text-gray-500 text-sm">
          🎉 Aucune page de votre sitemap sans trafic sur cette période. Excellent.
        </div>
      )}

      {!isLoading && data?.has_data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Page sans trafic</th>
                <th className="text-left px-3 py-3 font-semibold">Title</th>
                <th className="text-right px-3 py-3 font-semibold">HTTP</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((it) => (
                <tr key={it.page} className="hover:bg-gray-50">
                  <td className="px-4 py-3 max-w-md">
                    <a href={it.page} target="_blank" rel="noopener"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1 truncate"
                      title={it.page}>
                      <span className="truncate">{shortenUrl(it.page)}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </td>
                  <td className="px-3 py-3 max-w-xs">
                    {it.title
                      ? <span className="text-xs text-gray-700 line-clamp-2" title={it.title}>{it.title}</span>
                      : <span className="text-xs text-gray-400 italic">Non collecté</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {it.status_code
                      ? <span className={it.status_code >= 400 ? "text-red-600 font-semibold" : "text-gray-700"}>{it.status_code}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/sites/${siteId}/page-details?url=${encodeURIComponent(it.page)}&period=90`}
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50"
                      title="Voir les détails de la page"
                    >
                      <Eye className="w-3 h-3" /> Détails
                    </Link>
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

function Top3ConsolidateCard({ siteId, domain }: { siteId: string; domain?: string }) {
  const [period, setPeriod] = useState(28);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<Top3Response>({
    queryKey: ["qw-top-3", siteId, period],
    queryFn: async () =>
      (await api.get(`/websites/${siteId}/quick-wins/top-3-consolidate?period=${period}`)).data,
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">
                <Sparkles className="w-3 h-3" /> Quick Win #3
              </span>
              {data?.has_data && data.total_candidates !== undefined && (
                <span className="text-xs text-gray-500">
                  {data.total_candidates} requête{data.total_candidates > 1 ? "s" : ""} en Top 3
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900">Requêtes en position 1–3 à consolider</h3>
            <p className="text-sm text-gray-500 mt-1">
              Vos meilleures positions sont des actifs précieux mais fragiles : renforcez les pages cibles
              avec des liens internes depuis vos pages les plus visitées pour solidifier leur autorité.
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
            <li>Repérez la <b>page cible</b> de chaque requête en Top 3 (tableau ci-dessous).</li>
            <li>Ouvrez vos <b>pages sources</b> les plus visitées (panneau de droite) et y ajoutez un lien interne vers la page cible.</li>
            <li>Utilisez comme texte d'ancre la <b>requête ou une variation proche</b> (sans sur-optimiser).</li>
            <li>Pour vérifier si un lien interne existe déjà, recherchez sur Google : <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">site:{domain || "votredomaine.com"} "ancre attendue"</code>.</li>
            <li>Republiez les pages sources puis demandez l'indexation dans Google Search Console.</li>
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
          Aucune requête en position 1–3 avec suffisamment d'impressions sur cette période.
        </div>
      )}

      {!isLoading && data?.has_data && data.items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
          <div className="lg:col-span-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Requête</th>
                  <th className="text-left px-3 py-3 font-semibold">Page cible</th>
                  <th className="text-right px-3 py-3 font-semibold">Position</th>
                  <th className="text-right px-3 py-3 font-semibold">Impressions</th>
                  <th className="text-right px-3 py-3 font-semibold">Clics</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((it, i) => (
                  <tr key={`${it.page}-${it.query}-${i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-gray-900 truncate" title={it.query}>{it.query}</div>
                    </td>
                    <td className="px-3 py-3 max-w-xs">
                      <a href={it.page} target="_blank" rel="noopener"
                        className="text-blue-600 hover:underline inline-flex items-center gap-1 truncate"
                        title={it.page}>
                        <span className="truncate">{shortenUrl(it.page)}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold text-green-600">{it.position.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmt(it.impressions)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmt(it.clicks)}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <a href={it.google_search_url} target="_blank" rel="noopener"
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50"
                          title="Voir la SERP Google">
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
          <aside className="bg-gray-50 border-l border-gray-100 p-5">
            <h4 className="text-sm font-semibold text-gray-900 mb-1">Pages sources recommandées</h4>
            <p className="text-xs text-gray-500 mb-3">Ajoutez vos liens internes depuis ces pages — ce sont vos pages les plus visitées sur la période.</p>
            <ol className="space-y-2.5">
              {data.source_pages.map((sp, i) => (
                <li key={sp.page} className="text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold text-gray-400 w-4">{i + 1}.</span>
                    <a href={sp.page} target="_blank" rel="noopener"
                      className="text-blue-600 hover:underline truncate flex-1" title={sp.page}>
                      {shortenUrl(sp.page)}
                    </a>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">
                    {fmt(sp.clicks)} clics · {fmt(sp.impressions)} impressions
                  </p>
                </li>
              ))}
              {data.source_pages.length === 0 && (
                <li className="text-xs text-gray-400">Pas encore assez de données.</li>
              )}
            </ol>
          </aside>
        </div>
      )}
    </div>
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
  const { data: website } = useQuery<{ domain?: string }>({
    queryKey: ["website", id],
    queryFn: async () => (await api.get(`/websites/${id}`)).data,
  });
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
          <LowCtrCard siteId={id} />
          <Top3LowCtrCard siteId={id} />
          <Top3ConsolidateCard siteId={id} domain={website?.domain} />
          <ZeroTrafficCard siteId={id} />
        </main>
      </div>
    </div>
  );
}
