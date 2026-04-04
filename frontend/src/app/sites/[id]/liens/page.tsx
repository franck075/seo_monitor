"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import {
  Link2, Globe, ExternalLink, RefreshCw, Settings, Key,
  TrendingUp, TrendingDown, Plus, Check, Info, Shield, Zap,
  AlertTriangle, Bell, BellOff, Trash2, ToggleLeft, ToggleRight, X
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

// ── Helpers ─────────────────────────────────────────────────────────────────

function drColor(dr: number | null): string {
  if (!dr) return "bg-gray-100 text-gray-500";
  if (dr >= 70) return "bg-green-100 text-green-700";
  if (dr >= 40) return "bg-blue-100 text-blue-700";
  if (dr >= 20) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-600";
}

function DRBadge({ dr }: { dr: number | null }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${drColor(dr)}`}>
      DR {dr ?? "—"}
    </span>
  );
}

function FollowBadge({ dofollow }: { dofollow: boolean }) {
  return dofollow
    ? <span className="px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-200">dofollow</span>
    : <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500 border border-gray-200">nofollow</span>;
}

function LinkTypeBadges({ bl }: { bl: any }) {
  const badges = [];
  if (bl.is_ugc) badges.push(<span key="ugc" className="px-1.5 py-0.5 rounded text-xs bg-purple-50 text-purple-700 border border-purple-200">UGC</span>);
  if (bl.is_sponsored) badges.push(<span key="spo" className="px-1.5 py-0.5 rounded text-xs bg-yellow-50 text-yellow-700 border border-yellow-200">Sponsorisé</span>);
  if (bl.is_spam) badges.push(<span key="spam" className="px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-700 border border-red-200">Spam</span>);
  if (bl.http_code && bl.http_code >= 400) badges.push(<span key="http" className="px-1.5 py-0.5 rounded text-xs bg-orange-50 text-orange-700 border border-orange-200">HTTP {bl.http_code}</span>);
  return badges.length > 0 ? <div className="flex gap-1 flex-wrap">{badges}</div> : null;
}

function SnippetContext({ left, anchor, right }: { left?: string; anchor?: string; right?: string }) {
  if (!left && !anchor && !right) return null;
  return (
    <div className="text-xs text-gray-400 italic truncate max-w-[280px]">
      {left && <span>{left} </span>}
      {anchor && <span className="text-gray-700 font-medium not-italic bg-yellow-50 px-0.5 rounded">{anchor}</span>}
      {right && <span> {right}</span>}
    </div>
  );
}

function TrafficBadge({ traffic }: { traffic: number | null }) {
  if (!traffic) return <span className="text-xs text-gray-400">—</span>;
  const formatted = traffic >= 1000 ? `${(traffic / 1000).toFixed(1)}k` : String(traffic);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-medium">
      <Zap className="w-3 h-3" />{formatted}
    </span>
  );
}

function StatusBadge({ isNew, isLost }: { isNew: boolean; isLost: boolean }) {
  if (isNew) return <span className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200 font-medium">Nouveau</span>;
  if (isLost) return <span className="px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-700 border border-red-200 font-medium">Perdu</span>;
  return null;
}

// ── Settings Modal ───────────────────────────────────────────────────────────

function SettingsModal({
  websiteId, hasKey, onClose
}: { websiteId: string; hasKey: boolean; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const qc = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (apiKey: string) =>
      (await api.put(`/websites/${websiteId}/links/settings`, { api_key: apiKey })).data,
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["links-settings", websiteId] });
      setTimeout(() => { setSaved(false); onClose(); }, 1200);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => (await api.delete(`/websites/${websiteId}/links/settings`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["links-settings", websiteId] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-50 rounded-lg"><Key className="w-5 h-5 text-orange-600" /></div>
          <div>
            <h2 className="font-semibold text-gray-900">Clé API Ahrefs</h2>
            <p className="text-xs text-gray-500">Nécessaire pour accéder aux données de backlinks</p>
          </div>
        </div>

        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 flex gap-2 text-xs text-blue-700">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            Google Search Console ne fournit pas les backlinks via son API. Nous utilisons <strong>Ahrefs</strong> qui dispose de la plus grande base de données de liens du web.
            Votre clé est chiffrée et stockée en sécurité.
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Clé API Ahrefs</label>
          <input
            type="password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            placeholder={hasKey ? "••••••••••••••••••••" : "Collez votre clé API ici"}
            value={key}
            onChange={e => setKey(e.target.value)}
          />
          <p className="text-xs text-gray-400">
            Trouvez votre clé dans Ahrefs → Account Settings → API key
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          {hasKey && (
            <button
              onClick={() => deleteMutation.mutate()}
              className="px-4 py-2 border border-red-300 rounded-lg text-sm text-red-600 hover:bg-red-50"
            >
              Supprimer
            </button>
          )}
          <button
            onClick={() => key.trim() && saveMutation.mutate(key.trim())}
            disabled={!key.trim() || saveMutation.isPending || saved}
            className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saved ? <><Check className="w-4 h-4" /> Sauvegardé</> : saveMutation.isPending ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── No Key State ─────────────────────────────────────────────────────────────

function NoKeyPrompt({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
      <div className="p-4 bg-orange-50 rounded-2xl">
        <Key className="w-10 h-10 text-orange-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Connexion Ahrefs requise</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          Le rapport Liens de Google Search Console n'est pas accessible via API.
          Configurez votre clé Ahrefs pour surveiller backlinks, domaines référents et anchor texts.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4 max-w-sm w-full mt-2">
        {[
          { icon: Link2, label: "Backlinks", desc: "Liens entrants" },
          { icon: Globe, label: "Domaines référents", desc: "Sites uniques" },
          { icon: Shield, label: "Anchor texts", desc: "Distribution" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-center">
            <Icon className="w-5 h-5 text-gray-400 mx-auto mb-1" />
            <p className="text-xs font-medium text-gray-700">{label}</p>
            <p className="text-xs text-gray-400">{desc}</p>
          </div>
        ))}
      </div>
      <button
        onClick={onSetup}
        className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-colors"
      >
        <Plus className="w-4 h-4" /> Configurer Ahrefs
      </button>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

type Tab = "backlinks" | "domains" | "anchors" | "monitors" | "suspicious";
type BLFilter = "all" | "new" | "lost" | "dofollow";
type DFilter = "all" | "new" | "lost";

export default function LinksPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const qc = useQueryClient();
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<Tab>("backlinks");
  const [blFilter, setBlFilter] = useState<BLFilter>("all");
  const [dFilter, setDFilter] = useState<DFilter>("all");

  const { data: settings } = useQuery({
    queryKey: ["links-settings", id],
    queryFn: async () => (await api.get(`/websites/${id}/links/settings`)).data,
  });

  const hasKey = Boolean(settings?.has_ahrefs_key);

  const { data: overview } = useQuery({
    queryKey: ["links-overview", id],
    queryFn: async () => (await api.get(`/websites/${id}/links/overview`)).data,
    enabled: hasKey,
  });

  const { data: backlinks = [] } = useQuery({
    queryKey: ["links-backlinks", id, blFilter],
    queryFn: async () =>
      (await api.get(`/websites/${id}/links/backlinks`, {
        params: {
          only_new: blFilter === "new",
          only_lost: blFilter === "lost",
          dofollow_only: blFilter === "dofollow",
          limit: 200,
        },
      })).data,
    enabled: hasKey && tab === "backlinks",
  });

  const { data: domains = [] } = useQuery({
    queryKey: ["links-domains", id, dFilter],
    queryFn: async () =>
      (await api.get(`/websites/${id}/links/referring-domains`, {
        params: {
          only_new: dFilter === "new",
          only_lost: dFilter === "lost",
          limit: 200,
        },
      })).data,
    enabled: hasKey && tab === "domains",
  });

  const { data: anchors = [] } = useQuery({
    queryKey: ["links-anchors", id],
    queryFn: async () => (await api.get(`/websites/${id}/links/anchors`)).data,
    enabled: hasKey && tab === "anchors",
  });

  const { data: monitors = [], refetch: refetchMonitors } = useQuery({
    queryKey: ["links-monitors", id],
    queryFn: async () => (await api.get(`/websites/${id}/links/monitors`)).data,
    enabled: hasKey,
  });

  const { data: suspicious = [] } = useQuery({
    queryKey: ["links-suspicious", id],
    queryFn: async () => (await api.get(`/websites/${id}/links/suspicious`)).data,
    enabled: hasKey && tab === "suspicious",
  });

  const [showAddMonitor, setShowAddMonitor] = useState(false);
  const [monitorTargets, setMonitorTargets] = useState("");
  const [monNotifyNew, setMonNotifyNew] = useState(false);
  const [monNotifySuspicious, setMonNotifySuspicious] = useState(true);
  const [monDrThreshold, setMonDrThreshold] = useState(10);
  const [monChannels, setMonChannels] = useState<string[]>(["email"]);

  const createMonitorMutation = useMutation({
    mutationFn: async () => (await api.post(`/websites/${id}/links/monitors`, {
      targets: monitorTargets.split("\n").map(t => t.trim()).filter(Boolean),
      notify_new: monNotifyNew,
      notify_suspicious: monNotifySuspicious,
      dr_threshold: monDrThreshold,
      channels: monChannels,
    })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links-monitors", id] });
      setShowAddMonitor(false);
      setMonitorTargets("");
    },
  });

  const deleteMonitorMutation = useMutation({
    mutationFn: async (monitorId: number) =>
      (await api.delete(`/websites/${id}/links/monitors/${monitorId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["links-monitors", id] }),
  });

  const toggleMonitorMutation = useMutation({
    mutationFn: async ({ monitorId, active }: { monitorId: number; active: boolean }) =>
      (await api.put(`/websites/${id}/links/monitors/${monitorId}`, { is_active: active })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["links-monitors", id] }),
  });

  const dismissMutation = useMutation({
    mutationFn: async (blId: number) =>
      (await api.post(`/websites/${id}/links/suspicious/${blId}/dismiss`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["links-suspicious", id] }),
  });

  const refreshMutation = useMutation({
    mutationFn: async () => (await api.post(`/websites/${id}/links/refresh`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links-overview", id] });
      qc.invalidateQueries({ queryKey: ["links-backlinks", id] });
      qc.invalidateQueries({ queryKey: ["links-domains", id] });
    },
  });

  const latest = overview?.latest;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <TopNav title="Liens & Backlinks" />
        <main className="p-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-50 rounded-xl"><Link2 className="w-6 h-6 text-orange-600" /></div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Profil de liens</h1>
                <p className="text-sm text-gray-500">Backlinks, domaines référents et anchor texts via Ahrefs</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                <Settings className="w-4 h-4" />
                {hasKey ? "Clé Ahrefs" : "Configurer"}
              </button>
              {hasKey && (
                <button
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                  {refreshMutation.isPending ? "Actualisation…" : "Actualiser"}
                </button>
              )}
            </div>
          </div>

          {/* GSC Notice */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <strong>Pourquoi pas directement la Search Console ?</strong> Google ne rend pas le rapport Liens accessible via son API.
              Seul l'interface web GSC affiche ces données, sans export automatisé. Ahrefs dispose de la base de liens la plus complète du marché.
            </div>
          </div>

          {!hasKey ? (
            <NoKeyPrompt onSetup={() => setShowSettings(true)} />
          ) : (
            <>
              {/* Stats bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                  { label: "Backlinks totaux", value: latest?.total_backlinks?.toLocaleString() ?? "—", icon: Link2, color: "blue" },
                  { label: "Domaines référents", value: latest?.total_referring_domains?.toLocaleString() ?? "—", icon: Globe, color: "purple" },
                  { label: "Dofollow", value: latest ? `${Math.round((latest.dofollow_backlinks / (latest.total_backlinks || 1)) * 100)}%` : "—", icon: Shield, color: "green" },
                  { label: "Nouveaux liens", value: overview?.new_backlinks?.toLocaleString() ?? "—", icon: TrendingUp, color: "orange" },
                  { label: "Liens perdus", value: overview?.lost_backlinks?.toLocaleString() ?? "—", icon: TrendingDown, color: "red" },
                ].map(({ label, value, icon: Icon, color }) => {
                  const colors: Record<string, string> = {
                    blue: "bg-blue-50 text-blue-600",
                    purple: "bg-purple-50 text-purple-600",
                    green: "bg-green-50 text-green-600",
                    orange: "bg-orange-50 text-orange-600",
                    red: "bg-red-50 text-red-600",
                  };
                  return (
                    <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${colors[color]}`}><Icon className="w-4 h-4" /></div>
                        <span className="text-xs text-gray-500">{label}</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{value}</p>
                    </div>
                  );
                })}
              </div>

              {/* History chart */}
              {overview?.history?.length > 1 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Évolution (30 derniers jours)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={overview.history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="backlinks" stroke="#3b82f6" name="Backlinks" dot={false} strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="referring_domains" stroke="#8b5cf6" name="Domaines référents" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Tabs */}
              <div className="flex flex-wrap gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
                {(["backlinks", "domains", "anchors", "monitors", "suspicious"] as Tab[]).map(t => {
                  const labels: Record<Tab, string> = {
                    backlinks: `Backlinks (${latest?.total_backlinks?.toLocaleString() ?? 0})`,
                    domains: `Domaines référents (${latest?.total_referring_domains?.toLocaleString() ?? 0})`,
                    anchors: "Anchor texts",
                    monitors: `Moniteurs (${monitors.length})`,
                    suspicious: suspicious.length > 0
                      ? `⚠️ Suspects (${suspicious.length})`
                      : "Suspects",
                  };
                  const isAlert = t === "suspicious" && suspicious.length > 0;
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        tab === t
                          ? isAlert ? "bg-red-600 text-white" : "bg-orange-600 text-white"
                          : isAlert ? "text-red-600 hover:bg-red-50" : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {labels[t]}
                    </button>
                  );
                })}
              </div>

              {/* ── Backlinks tab ──────────────────────────────────────────── */}
              {tab === "backlinks" && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Filters */}
                  <div className="flex items-center gap-2 p-4 border-b border-gray-100">
                    {(["all", "new", "lost", "dofollow"] as BLFilter[]).map(f => {
                      const labels: Record<BLFilter, string> = { all: "Tous", new: "Nouveaux", lost: "Perdus", dofollow: "Dofollow" };
                      return (
                        <button
                          key={f}
                          onClick={() => setBlFilter(f)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${blFilter === f ? "bg-orange-100 text-orange-700 border border-orange-300" : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"}`}
                        >
                          {labels[f]}
                        </button>
                      );
                    })}
                    <span className="ml-auto text-xs text-gray-400">{backlinks.length} résultats</span>
                  </div>

                  {backlinks.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-sm">Aucun backlink trouvé</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Page source</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Contexte anchor</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Page cible</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">DR / UR</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Trafic</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Statut</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">1er vu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {backlinks.map((bl: any) => (
                            <tr key={bl.id} className={`hover:bg-gray-50 ${bl.is_lost ? "opacity-50" : ""}`}>
                              {/* Source */}
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <img
                                      src={`https://www.google.com/s2/favicons?domain=${bl.domain_from}&sz=16`}
                                      alt="" className="w-4 h-4 rounded-sm"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                    <span className="text-xs font-medium text-gray-800 truncate max-w-[160px]">{bl.domain_from}</span>
                                  </div>
                                  <a href={bl.url_from} target="_blank" rel="noopener noreferrer"
                                    className="text-xs text-gray-400 truncate max-w-[180px] hover:text-blue-600 flex items-center gap-1">
                                    {bl.title?.substring(0, 40) || bl.url_from?.replace(/^https?:\/\//, "").substring(0, 40)}
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                </div>
                              </td>
                              {/* Anchor + snippet */}
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                  {bl.anchor_text
                                    ? <SnippetContext left={bl.snippet_left} anchor={bl.anchor_text} right={bl.snippet_right} />
                                    : <span className="text-xs text-gray-400 italic">(vide / image)</span>
                                  }
                                </div>
                              </td>
                              {/* Target */}
                              <td className="px-4 py-3">
                                <span className="text-xs text-gray-500 truncate max-w-[150px] block">
                                  {bl.url_to?.replace(/^https?:\/\/[^/]+/, "") || "/"}
                                </span>
                              </td>
                              {/* DR / UR */}
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  <DRBadge dr={bl.domain_rating} />
                                  {bl.url_rating != null && (
                                    <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-medium w-fit">
                                      UR {bl.url_rating}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {/* Traffic */}
                              <td className="px-4 py-3"><TrafficBadge traffic={bl.traffic} /></td>
                              {/* Type */}
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  <FollowBadge dofollow={bl.is_dofollow} />
                                  <LinkTypeBadges bl={bl} />
                                </div>
                              </td>
                              {/* Status */}
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  <StatusBadge isNew={bl.is_new} isLost={bl.is_lost} />
                                  {bl.lost_reason && <span className="text-xs text-red-500">{bl.lost_reason}</span>}
                                </div>
                              </td>
                              {/* Date */}
                              <td className="px-4 py-3 text-xs text-gray-400">
                                {bl.first_seen_at ? new Date(bl.first_seen_at).toLocaleDateString("fr-FR") : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── Referring Domains tab ──────────────────────────────────── */}
              {tab === "domains" && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center gap-2 p-4 border-b border-gray-100">
                    {(["all", "new", "lost"] as DFilter[]).map(f => {
                      const labels: Record<DFilter, string> = { all: "Tous", new: "Nouveaux", lost: "Perdus" };
                      return (
                        <button
                          key={f}
                          onClick={() => setDFilter(f)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dFilter === f ? "bg-purple-100 text-purple-700 border border-purple-300" : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"}`}
                        >
                          {labels[f]}
                        </button>
                      );
                    })}
                    <span className="ml-auto text-xs text-gray-400">{domains.length} domaines</span>
                  </div>

                  {domains.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-sm">Aucun domaine référent trouvé</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Domaine</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">DR</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Backlinks</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Statut</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">1er vu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {domains.map((d: any) => (
                            <tr key={d.id} className={`hover:bg-gray-50 ${d.is_lost ? "opacity-50" : ""}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${d.domain}&sz=16`}
                                    alt=""
                                    className="w-4 h-4 rounded-sm"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                  />
                                  <a
                                    href={`https://${d.domain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-gray-800 hover:text-blue-600 flex items-center gap-1"
                                  >
                                    {d.domain}
                                    <ExternalLink className="w-3 h-3 text-gray-400" />
                                  </a>
                                </div>
                              </td>
                              <td className="px-4 py-3"><DRBadge dr={d.domain_rating} /></td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-medium">
                                  {d.backlinks_count}
                                </span>
                              </td>
                              <td className="px-4 py-3"><FollowBadge dofollow={d.is_dofollow} /></td>
                              <td className="px-4 py-3"><StatusBadge isNew={d.is_new} isLost={d.is_lost} /></td>
                              <td className="px-4 py-3 text-xs text-gray-400">
                                {d.first_seen_at ? new Date(d.first_seen_at).toLocaleDateString("fr-FR") : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── Anchor Texts tab ───────────────────────────────────────── */}
              {tab === "anchors" && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <span className="text-xs text-gray-400">{anchors.length} anchors</span>
                  </div>
                  {anchors.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-sm">Aucun anchor text trouvé</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Anchor text</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Backlinks</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Domaines référents</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Dofollow</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">% du total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {anchors.map((a: any, i: number) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <span className={`text-sm font-medium ${!a.anchor ? "text-gray-400 italic" : "text-gray-800"}`}>
                                  {a.anchor || "(vide / image)"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{a.backlinks_count.toLocaleString()}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{a.referring_domains_count.toLocaleString()}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{a.dofollow_count.toLocaleString()}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                    <div
                                      className="h-2 rounded-full bg-orange-400"
                                      style={{ width: `${Math.min(a.percentage, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-600 font-medium w-10 text-right">{a.percentage}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── Monitors tab ───────────────────────────────────────────── */}
              {tab === "monitors" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      Surveillez des URLs ou domaines spécifiques. Vous serez alerté des nouveaux liens et backlinks suspects.
                    </p>
                    <button
                      onClick={() => setShowAddMonitor(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700"
                    >
                      <Plus className="w-4 h-4" /> Ajouter
                    </button>
                  </div>

                  {monitors.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
                      <Bell className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Aucun moniteur configuré</p>
                      <p className="text-xs text-gray-400 mt-1">Ajoutez des URLs ou domaines à surveiller</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {monitors.map((m: any) => (
                        <div key={m.id} className={`bg-white rounded-xl border p-4 flex items-center gap-4 ${m.is_active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{m.target}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                              {m.notify_suspicious && (
                                <span className="flex items-center gap-1 text-orange-600">
                                  <AlertTriangle className="w-3 h-3" /> Suspects (DR &lt; {m.dr_threshold})
                                </span>
                              )}
                              {m.notify_new && (
                                <span className="flex items-center gap-1 text-blue-600">
                                  <Bell className="w-3 h-3" /> Nouveaux liens
                                </span>
                              )}
                              <span>Canaux : {m.channels.join(", ") || "—"}</span>
                              {m.last_checked_at && (
                                <span>Vérifié {new Date(m.last_checked_at).toLocaleDateString("fr-FR")}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleMonitorMutation.mutate({ monitorId: m.id, active: !m.is_active })}
                              className="text-gray-400 hover:text-gray-600"
                              title={m.is_active ? "Désactiver" : "Activer"}
                            >
                              {m.is_active
                                ? <ToggleRight className="w-5 h-5 text-orange-500" />
                                : <ToggleLeft className="w-5 h-5" />}
                            </button>
                            <button
                              onClick={() => deleteMonitorMutation.mutate(m.id)}
                              className="text-gray-400 hover:text-red-600"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Suspicious tab ─────────────────────────────────────────── */}
              {tab === "suspicious" && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-medium text-gray-700">Backlinks suspects détectés</span>
                    <span className="text-xs text-gray-400 ml-auto">{suspicious.length} backlinks</span>
                  </div>

                  {suspicious.length === 0 ? (
                    <div className="py-12 text-center">
                      <Shield className="w-8 h-8 text-green-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Aucun backlink suspect détecté</p>
                      <p className="text-xs text-gray-400 mt-1">Votre profil de liens semble sain</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-red-50 border-b border-red-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-700">Source suspecte</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-700">Anchor text</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-700">DR</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-700">Raisons</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-700">Détecté</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-700">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {suspicious.map((bl: any) => (
                            <tr key={bl.id} className="hover:bg-red-50/30">
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-medium text-gray-800">{bl.domain_from}</span>
                                  <a href={bl.url_from} target="_blank" rel="noopener noreferrer"
                                    className="text-xs text-gray-400 truncate max-w-[200px] hover:text-blue-600 flex items-center gap-1">
                                    {bl.url_from?.replace(/^https?:\/\//, "").substring(0, 45)}
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-700 italic">
                                {bl.anchor_text || <span className="text-gray-400 not-italic">(vide)</span>}
                              </td>
                              <td className="px-4 py-3">
                                <DRBadge dr={bl.domain_rating} />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  {(bl.suspicious_reason || "").split(" | ").filter(Boolean).map((r: string, i: number) => (
                                    <span key={i} className="px-2 py-0.5 rounded text-xs bg-red-50 text-red-700 border border-red-200">
                                      {r}
                                    </span>
                                  ))}
                                  {bl.is_spam && <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-800 font-semibold">🚨 SPAM Ahrefs</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-400">
                                {bl.first_seen_at ? new Date(bl.first_seen_at).toLocaleDateString("fr-FR") : "—"}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => dismissMutation.mutate(bl.id)}
                                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-100"
                                  title="Ignorer ce backlink"
                                >
                                  <X className="w-3 h-3" /> Ignorer
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── Add Monitor Modal ─────────────────────────────────────────────── */}
      {showAddMonitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-50 rounded-lg"><Bell className="w-5 h-5 text-orange-600" /></div>
                <div>
                  <h2 className="font-semibold text-gray-900">Nouveau moniteur de backlinks</h2>
                  <p className="text-xs text-gray-500">Surveillez des URLs ou domaines spécifiques</p>
                </div>
              </div>
              <button onClick={() => setShowAddMonitor(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">URLs ou domaines à surveiller</label>
              <textarea
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
                placeholder={"https://monsite.com/page-importante\nhttps://monsite.com/blog\nmonsite.com"}
                value={monitorTargets}
                onChange={e => setMonitorTargets(e.target.value)}
              />
              <p className="text-xs text-gray-400">Une URL ou domaine par ligne. Pour un domaine entier, entrez juste le domaine (ex: monsite.com)</p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Alertes</label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={monNotifySuspicious} onChange={e => setMonNotifySuspicious(e.target.checked)} className="rounded" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">⚠️ Backlinks suspects</p>
                    <p className="text-xs text-gray-400">Spam Ahrefs, DR très faible, UGC toxique, erreurs HTTP</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={monNotifyNew} onChange={e => setMonNotifyNew(e.target.checked)} className="rounded" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">🔗 Tout nouveau backlink</p>
                    <p className="text-xs text-gray-400">Alerte dès qu'un nouveau lien est détecté (peut être fréquent)</p>
                  </div>
                </label>
              </div>
            </div>

            {monNotifySuspicious && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Seuil DR suspect : <span className="text-orange-600 font-bold">{monDrThreshold}</span>
                </label>
                <input
                  type="range" min={0} max={50} step={5}
                  value={monDrThreshold}
                  onChange={e => setMonDrThreshold(Number(e.target.value))}
                  className="w-full accent-orange-600"
                />
                <p className="text-xs text-gray-400">Les backlinks avec un DR inférieur à {monDrThreshold} seront marqués suspects</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Canaux de notification</label>
              <div className="flex gap-3">
                {["email", "telegram"].map(ch => (
                  <label key={ch} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={monChannels.includes(ch)}
                      onChange={e => setMonChannels(prev =>
                        e.target.checked ? [...prev, ch] : prev.filter(c => c !== ch)
                      )}
                      className="rounded"
                    />
                    <span className="text-sm capitalize text-gray-700">{ch}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAddMonitor(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={() => createMonitorMutation.mutate()}
                disabled={!monitorTargets.trim() || createMonitorMutation.isPending}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
              >
                {createMonitorMutation.isPending ? "Création…" : "Créer le moniteur"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsModal websiteId={id} hasKey={hasKey} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
