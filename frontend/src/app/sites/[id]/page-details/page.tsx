"use client";
import { useState, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { ArrowLeft, ExternalLink, ArrowUp, ArrowDown } from "lucide-react";
import Link from "next/link";

type Vital = {
  lcp: number | null; cls: number | null; inp: number | null;
  ttfb: number | null; fcp: number | null;
  performance_score: number | null;
  lcp_rating: string | null; cls_rating: string | null; inp_rating: string | null;
  recorded_at: string | null;
};
type PageDetails = {
  url: string; period: number;
  current_range: { start: string; end: string };
  previous_range: { start: string; end: string };
  search: {
    current: { clicks: number; impressions: number; ctr: number; position: number };
    previous: { clicks: number; impressions: number; ctr: number; position: number };
    changes: { clicks_pct: number | null; impressions_pct: number | null; ctr_diff: number; position_diff: number };
    top_queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  } | null | { error: string };
  vitals: { mobile: Vital | null; desktop: Vital | null };
  seo: {
    title: string | null; meta_description: string | null; h1: string | null; h2_count: number;
    canonical: string | null; robots_meta: string | null;
    og_title: string | null; og_description: string | null;
    recorded_at: string | null;
  } | null;
  http: {
    status_code: number | null; response_time: number | null; redirect_url: string | null;
    is_error: boolean | null; checked_at: string | null;
  } | null;
};

const PERIODS = [
  { value: 7, label: "7 jours" }, { value: 28, label: "28 jours" },
  { value: 90, label: "3 mois" }, { value: 180, label: "6 mois" }, { value: 365, label: "12 mois" },
];

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("fr-FR").format(n);
}

function Trend({ value, invert = false, suffix = "" }: { value: number | null; invert?: boolean; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-xs text-gray-400">—</span>;
  const positive = invert ? value < 0 : value > 0;
  const color = positive ? "text-green-600" : value === 0 ? "text-gray-500" : "text-red-600";
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : null;
  return (
    <span className={`text-xs font-medium inline-flex items-center gap-0.5 ${color}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {Math.abs(value).toFixed(value % 1 === 0 ? 0 : 1)}{suffix}
    </span>
  );
}

function MetricBlock({ label, value, change, suffix = "" }: { label: string; value: string | number; change?: React.ReactNode; suffix?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}{suffix}</p>
      {change && <div className="mt-1">{change}</div>}
    </div>
  );
}

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return null;
  const color = rating === "good" ? "bg-green-100 text-green-700"
    : rating === "needs_improvement" ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700";
  return <span className={`text-xs px-2 py-0.5 rounded ${color}`}>{rating}</span>;
}

function VitalsBlock({ title, v }: { title: string; v: Vital | null }) {
  if (!v) return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="font-semibold mb-2 text-gray-700">{title}</p>
      <p className="text-sm text-gray-400">Aucune mesure récente.</p>
    </div>
  );
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-gray-900">{title}</p>
        {v.performance_score !== null && (
          <span className="text-2xl font-bold text-gray-900">{v.performance_score}/100</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">LCP</p>
          <p className="font-semibold text-gray-900">{v.lcp ? `${(v.lcp / 1000).toFixed(2)}s` : "—"}</p>
          <RatingBadge rating={v.lcp_rating} />
        </div>
        <div>
          <p className="text-xs text-gray-500">CLS</p>
          <p className="font-semibold text-gray-900">{v.cls?.toFixed(3) ?? "—"}</p>
          <RatingBadge rating={v.cls_rating} />
        </div>
        <div>
          <p className="text-xs text-gray-500">INP</p>
          <p className="font-semibold text-gray-900">{v.inp ? `${v.inp.toFixed(0)}ms` : "—"}</p>
          <RatingBadge rating={v.inp_rating} />
        </div>
        <div>
          <p className="text-xs text-gray-500">TTFB</p>
          <p className="font-semibold text-gray-900">{v.ttfb ? `${v.ttfb.toFixed(0)}ms` : "—"}</p>
        </div>
      </div>
    </div>
  );
}

function PageDetailsContent({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") || "";
  const initialPeriod = Number(searchParams.get("period") || 28);
  const [period, setPeriod] = useState(initialPeriod);

  const { data, isLoading } = useQuery<PageDetails>({
    queryKey: ["page-details", id, url, period],
    queryFn: async () => (await api.get(`/websites/${id}/pages/details?url=${encodeURIComponent(url)}&period=${period}`)).data,
    enabled: !!url,
  });

  if (!url) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800">
          <p className="font-semibold">URL manquante</p>
          <p className="text-sm mt-1">Accédez à cette page depuis le tableau des Top pages.</p>
          <Link href={`/sites/${id}/top-pages`} className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm mt-3">
            <ArrowLeft className="w-3 h-3" /> Retour aux Top pages
          </Link>
        </div>
      </div>
    );
  }

  const hasSearch = data?.search && !("error" in data.search) && data.search !== null;

  return (
    <main className="p-6 space-y-6">
      <div>
        <Link href={`/sites/${id}/top-pages`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-3 h-3" /> Top pages
        </Link>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          Détails de la page
          <a href={url} target="_blank" rel="noopener" className="text-blue-600 hover:underline text-sm font-normal inline-flex items-center gap-1">
            <ExternalLink className="w-3 h-3" /> Ouvrir
          </a>
        </h1>
        <p className="text-sm text-gray-500 mt-1 break-all">{url}</p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Métriques Search Console</h2>
        <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-400">Chargement…</div>}

      {data && hasSearch && data.search && !("error" in data.search) && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricBlock label="Clics" value={fmt(data.search.current.clicks)} change={<Trend value={data.search.changes.clicks_pct} suffix="%" />} />
            <MetricBlock label="Impressions" value={fmt(data.search.current.impressions)} change={<Trend value={data.search.changes.impressions_pct} suffix="%" />} />
            <MetricBlock label="CTR" value={`${data.search.current.ctr.toFixed(1)}%`} change={<Trend value={data.search.changes.ctr_diff} suffix="pts" />} />
            <MetricBlock label="Position moyenne" value={data.search.current.position.toFixed(1)} change={<Trend value={-data.search.changes.position_diff} invert={false} />} />
          </div>

          {data.search.top_queries.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Top mots-clés (sur cette page)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">Requête</th>
                      <th className="text-right px-3 py-2 font-semibold">Clics</th>
                      <th className="text-right px-3 py-2 font-semibold">Impressions</th>
                      <th className="text-right px-3 py-2 font-semibold">CTR</th>
                      <th className="text-right px-4 py-2 font-semibold">Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.search.top_queries.slice(0, 15).map((q) => (
                      <tr key={q.query} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{q.query}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(q.clicks)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(q.impressions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{q.ctr.toFixed(1)}%</td>
                        <td className="px-4 py-2 text-right tabular-nums">{q.position.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {data && !hasSearch && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
          Aucune donnée Search Console pour cette URL.
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VitalsBlock title="Core Web Vitals — Mobile" v={data.vitals.mobile} />
          <VitalsBlock title="Core Web Vitals — Desktop" v={data.vitals.desktop} />
        </div>
      )}

      {data?.seo && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Données SEO on-page</h3>
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <Row label="Title" value={data.seo.title} />
            <Row label="Meta description" value={data.seo.meta_description} />
            <Row label="H1" value={data.seo.h1} />
            <Row label="Nombre de H2" value={String(data.seo.h2_count)} />
            <Row label="Canonical" value={data.seo.canonical} />
            <Row label="Robots meta" value={data.seo.robots_meta} />
          </dl>
        </div>
      )}

      {data?.http && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Dernier check HTTP</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Code HTTP</p>
              <p className={`text-2xl font-bold ${data.http.is_error ? "text-red-600" : "text-green-600"}`}>
                {data.http.status_code ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Temps de réponse</p>
              <p className="text-2xl font-bold text-gray-900">
                {data.http.response_time ? `${data.http.response_time.toFixed(0)} ms` : "—"}
              </p>
            </div>
            {data.http.redirect_url && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500">Redirection</p>
                <p className="text-sm break-all">{data.http.redirect_url}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <dt className="text-gray-500 font-medium">{label}</dt>
      <dd className="col-span-2 text-gray-900 break-words">{value || <span className="text-gray-400">—</span>}</dd>
    </div>
  );
}

export default function PageDetailsPage({ params }: { params: { id: string } }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <TopNav title="Détails page" />
        <Suspense fallback={<div className="p-6 text-gray-400">Chargement…</div>}>
          <PageDetailsContent id={params.id} />
        </Suspense>
      </div>
    </div>
  );
}
