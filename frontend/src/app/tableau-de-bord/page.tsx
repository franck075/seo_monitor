"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import {
  Globe, AlertTriangle, Activity, Gauge, ArrowRight, Plus, Trash2,
  BarChart2, Zap, Shield, Map, FileText, Lightbulb, ExternalLink,
} from "lucide-react";
import Link from "next/link";

// ── Health ring ───────────────────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={56} height={56} viewBox="0 0 56 56">
      <circle cx={28} cy={28} r={r} fill="none" stroke="#f1f5f9" strokeWidth={5} />
      <circle cx={28} cy={28} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" transform="rotate(-90 28 28)" />
      <text x={28} y={33} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>{score}</text>
    </svg>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-32 bg-gray-100 rounded" />
          <div className="h-3 w-20 bg-gray-100 rounded" />
        </div>
        <div className="w-14 h-14 rounded-full bg-gray-100" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[...Array(3)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded-lg" />)}
      </div>
    </div>
  );
}

// ── Delete modal ──────────────────────────────────────────────────────────────

interface Site { id: number; domain: string; display_name?: string; health_score: number; is_active: boolean; }

function DeleteConfirmModal({ site, onConfirm, onCancel, isDeleting }: {
  site: Site; onConfirm: () => void; onCancel: () => void; isDeleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mx-auto mb-4">
          <Trash2 className="w-5 h-5 text-red-500" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 text-center">Supprimer ce site ?</h3>
        <p className="text-sm text-gray-500 text-center mt-2">
          <span className="font-medium text-gray-700">{site.display_name || site.domain}</span> et toutes ses données seront supprimés définitivement.
        </p>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={onConfirm} disabled={isDeleting}
            className="flex-1 bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-600 disabled:opacity-60">
            {isDeleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Site card ─────────────────────────────────────────────────────────────────

const SITE_QUICK_LINKS = [
  { label: "Mots-clés", href: "mots-cles", icon: BarChart2, color: "text-blue-500" },
  { label: "Trafic", href: "trafic", icon: Activity, color: "text-emerald-500" },
  { label: "Vitals", href: "performance", icon: Zap, color: "text-yellow-500" },
  { label: "Insights", href: "analyses", icon: Lightbulb, color: "text-orange-500" },
  { label: "Indexation", href: "indexation", icon: Globe, color: "text-violet-500" },
  { label: "HTTP", href: "surveillance-http", icon: Shield, color: "text-rose-500" },
];

function SiteCard({ site, onDelete }: { site: Site; onDelete: () => void }) {
  const healthColor = site.health_score >= 75 ? "text-green-600" : site.health_score >= 50 ? "text-amber-600" : "text-red-500";
  const initial = (site.display_name || site.domain).charAt(0).toUpperCase();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
      {/* Header */}
      <div className="p-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold text-white shadow-sm">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate text-sm leading-tight">
              {site.display_name || site.domain}
            </p>
            <a
              href={`https://${site.domain}`}
              target="_blank"
              rel="noopener"
              onClick={e => e.stopPropagation()}
              className="text-xs text-gray-400 hover:text-blue-500 transition-colors flex items-center gap-0.5 truncate mt-0.5"
            >
              {site.domain} <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <HealthRing score={site.health_score || 0} />
        </div>
      </div>

      {/* Status bar */}
      <div className="px-5 pb-4 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
          site.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${site.is_active ? "bg-green-500" : "bg-gray-400"}`} />
          {site.is_active ? "Actif" : "Inactif"}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Supprimer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick links grid */}
      <div className="border-t border-gray-50 grid grid-cols-3">
        {SITE_QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
          <Link
            key={href}
            href={`/sites/${site.id}/${href}`}
            className="flex flex-col items-center gap-1.5 py-3 hover:bg-gray-50 transition-colors border-r border-b border-gray-50 last:border-r-0 [&:nth-child(4)]:border-b-0 [&:nth-child(5)]:border-b-0 [&:nth-child(6)]:border-b-0"
          >
            <Icon className={`w-4 h-4 ${color}`} />
            <span className="text-[10px] text-gray-500 font-medium">{label}</span>
          </Link>
        ))}
      </div>

      {/* CTA */}
      <Link
        href={`/sites/${site.id}`}
        className="flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100"
      >
        Vue complète <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [confirmSite, setConfirmSite] = useState<Site | null>(null);

  const { data: websites, isLoading } = useQuery({
    queryKey: ["websites"],
    queryFn: async () => (await api.get("/websites")).data,
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/auth/me")).data,
    staleTime: 60_000,
  });

  const { data: perf } = useQuery({
    queryKey: ["perf-summary"],
    queryFn: async () => (await api.get("/websites/perf-summary")).data,
    staleTime: 300_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/websites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["websites"] });
      setConfirmSite(null);
    },
  });

  const totalSites: number = websites?.length || 0;
  const activeSites: number = websites?.filter((w: Site) => w.is_active).length || 0;
  const avgHealth: number = websites?.length
    ? Math.round(websites.reduce((s: number, w: Site) => s + (w.health_score || 0), 0) / websites.length) : 0;
  const healthColor = avgHealth >= 75 ? "text-green-600" : avgHealth >= 50 ? "text-amber-600" : "text-red-500";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const firstName = me?.full_name?.split(" ")[0] || "";

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopNav title="Dashboard" />
        <main className="flex-1 p-6 space-y-6 max-w-6xl">

          {/* ── Welcome ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {greeting}{firstName ? `, ${firstName}` : ""} 👋
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <Link
              href="/sites/nouveau"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" /> Ajouter un site
            </Link>
          </div>

          {/* ── KPI row ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Sites surveillés",
                value: totalSites,
                sub: `${activeSites} actif${activeSites !== 1 ? "s" : ""}`,
                icon: Globe,
                bg: "bg-blue-50", color: "text-blue-600", border: "border-blue-100",
              },
              {
                label: "Score santé moyen",
                value: avgHealth > 0 ? `${avgHealth}` : "—",
                sub: avgHealth >= 75 ? "Excellent" : avgHealth >= 50 ? "À surveiller" : "Critique",
                icon: Activity,
                bg: "bg-violet-50", color: avgHealth > 0 ? healthColor : "text-violet-600", border: "border-violet-100",
              },
              {
                label: "Alertes actives",
                value: "—",
                sub: "Aucune nouvelle",
                icon: AlertTriangle,
                bg: "bg-amber-50", color: "text-amber-600", border: "border-amber-100",
              },
              {
                label: "Vitesse des pages",
                value: perf?.avg_score != null ? `${perf.avg_score}/100` : "—",
                sub: perf?.avg_score != null
                  ? (perf.avg_score >= 75 ? `Rapide · ${perf.total_pages} pages` : perf.avg_score >= 50 ? `Moyen · ${perf.total_pages} pages` : `Lent · ${perf.total_pages} pages`)
                  : "Aucun scan disponible",
                icon: Gauge,
                bg: perf?.avg_score == null ? "bg-emerald-50" : perf.avg_score >= 75 ? "bg-emerald-50" : perf.avg_score >= 50 ? "bg-amber-50" : "bg-red-50",
                color: perf?.avg_score == null ? "text-emerald-600" : perf.avg_score >= 75 ? "text-emerald-600" : perf.avg_score >= 50 ? "text-amber-600" : "text-red-600",
                border: perf?.avg_score == null ? "border-emerald-100" : perf.avg_score >= 75 ? "border-emerald-100" : perf.avg_score >= 50 ? "border-amber-100" : "border-red-100",
              },
            ].map(({ label, value, sub, icon: Icon, bg, color, border }) => (
              <div key={label} className={`bg-white rounded-2xl border ${border} p-5 shadow-sm`}>
                <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-4`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
                <p className="text-xs font-medium text-gray-700 mt-1">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* ── Sites grid ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">Mes sites</h2>
                <p className="text-xs text-gray-400 mt-0.5">{totalSites} site{totalSites !== 1 ? "s" : ""} surveillé{totalSites !== 1 ? "s" : ""}</p>
              </div>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : !websites?.length ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-20 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
                  <Globe className="w-8 h-8 text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-700">Aucun site encore</p>
                  <p className="text-sm text-gray-400 mt-1">Ajoutez votre premier site pour commencer.</p>
                </div>
                <Link href="/sites/nouveau"
                  className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
                  Ajouter un site
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {websites.map((site: Site) => (
                  <SiteCard key={site.id} site={site} onDelete={() => setConfirmSite(site)} />
                ))}
                <Link
                  href="/sites/nouveau"
                  className="bg-white rounded-2xl border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 transition-colors flex flex-col items-center justify-center gap-3 py-12 text-center group"
                >
                  <div className="w-10 h-10 bg-gray-100 group-hover:bg-blue-100 rounded-xl flex items-center justify-center transition-colors">
                    <Plus className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-gray-400 group-hover:text-blue-600 transition-colors">Ajouter un site</p>
                </Link>
              </div>
            )}
          </div>

        </main>
      </div>

      {confirmSite && (
        <DeleteConfirmModal
          site={confirmSite}
          onConfirm={() => deleteMutation.mutate(confirmSite.id)}
          onCancel={() => setConfirmSite(null)}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
