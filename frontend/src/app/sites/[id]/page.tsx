"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { MetricCard } from "@/components/cards/MetricCard";
import Link from "next/link";
import { BarChart2, Globe, Shield, Activity, FileText, AlertTriangle, Map, RefreshCw, Check, Lightbulb, SearchCheck, MousePointerClick, Eye, Percent, Hash, FileStack, Sparkles } from "lucide-react";

type KeywordStats = {
  total_keywords: number;
  total_clicks: number;
  total_impressions: number;
  avg_ctr: number;
  avg_position: number;
  source?: string;
};

function fmtNumber(n: number | undefined | null): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return new Intl.NumberFormat("fr-FR").format(n);
}

export default function WebsiteDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [scanDone, setScanDone] = useState(false);

  const { data: website, isLoading } = useQuery({
    queryKey: ["website", id],
    queryFn: async () => (await api.get(`/websites/${id}`)).data,
  });

  const { data: gscStats } = useQuery<KeywordStats>({
    queryKey: ["keyword-live-stats", id],
    queryFn: async () => (await api.get(`/websites/${id}/keywords/live-stats?period=28`)).data,
    retry: false,
  });

  const scanMutation = useMutation({
    mutationFn: async () => (await api.post(`/websites/${id}/scan`)).data,
    onSuccess: () => {
      setScanDone(true);
      setTimeout(() => setScanDone(false), 4000);
    },
  });

  const quickLinks = [
    { href: `/sites/${id}/quick-wins`, label: "Quick Wins", icon: Sparkles },
    { href: `/sites/${id}/top-pages`, label: "Top pages", icon: FileStack },
    { href: `/sites/${id}/mots-cles`, label: "Mots-clés", icon: BarChart2 },
    { href: `/sites/${id}/trafic`, label: "Trafic", icon: Activity },
    { href: `/sites/${id}/performance`, label: "Core Web Vitals", icon: Globe },
    { href: `/sites/${id}/changements-seo`, label: "Changements SEO", icon: FileText },
    { href: `/sites/${id}/surveillance-http`, label: "Statuts HTTP", icon: Shield },
    { href: `/sites/${id}/analyses`, label: "Insights SEO", icon: Lightbulb },
    { href: `/sites/${id}/sitemaps`, label: "Sitemaps", icon: Map },
    { href: `/sites/${id}/indexation`, label: "Indexation", icon: AlertTriangle },
    { href: `/sites/${id}/securite`, label: "Sécurité SEO", icon: Shield },
    { href: `/sites/${id}/monitoring-avance`, label: "Monitoring SEO", icon: SearchCheck },
  ];

  const hasGsc = !!gscStats && gscStats.total_keywords > 0;

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1">
          <TopNav title="Chargement..." />
          <main className="p-6">
            <div className="text-center py-12 text-gray-400">Chargement du site...</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <TopNav title={website?.display_name || website?.domain || "Site"} />
        <main className="p-6 space-y-6">
          {website && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard title="Score santé" value={`${website.health_score}/100`} />
              <MetricCard title="Domaine" value={website.domain} />
              <MetricCard title="Fuseau horaire" value={website.timezone} />
              <MetricCard title="Statut" value={website.is_active ? "Actif" : "Inactif"} />
            </div>
          )}

          {hasGsc && gscStats && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-500">Performance Search Console — 28 derniers jours</h2>
                <Link href={`/sites/${id}/top-pages`} className="text-xs text-blue-600 hover:underline">
                  Voir les Top pages →
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <MetricCard title="Impressions" icon={Eye} value={fmtNumber(gscStats.total_impressions)} />
                <MetricCard title="Clics" icon={MousePointerClick} value={fmtNumber(gscStats.total_clicks)} />
                <MetricCard title="CTR" icon={Percent} value={`${gscStats.avg_ctr.toFixed(1)}%`} />
                <MetricCard title="Position moyenne" icon={Hash} value={gscStats.avg_position.toFixed(1)} />
                <MetricCard title="Mots-clés positionnés" icon={BarChart2} value={fmtNumber(gscStats.total_keywords)} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-500">Sections</h2>
            <button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending || scanDone}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-all"
            >
              {scanDone
                ? <><Check className="w-4 h-4" /> Scan lancé !</>
                : scanMutation.isPending
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Lancement…</>
                  : <><RefreshCw className="w-4 h-4" /> Scanner maintenant</>
              }
            </button>
          </div>

          {scanDone && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              ✅ Toutes les collectes de données ont été démarrées. Les résultats apparaîtront dans quelques minutes selon votre connexion et les APIs configurées.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickLinks.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-blue-300 transition-all text-center cursor-pointer">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-gray-700">{label}</span>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
