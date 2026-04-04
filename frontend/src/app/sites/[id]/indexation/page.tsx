"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import Link from "next/link";
import {
  Plus, Trash2, RefreshCw, Bell, X, Check, Search,
  AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp,
  ShieldAlert, ArrowRight, Eye,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StateCategory = "indexed" | "not_indexed" | "blocked" | "other" | "unknown";

type IndexationMonitor = {
  id: number;
  url: string;
  label: string;
  is_active: boolean;
  last_coverage_state: string | null;
  last_indexing_state: string | null;
  last_robots_state: string | null;
  last_crawl_time: string | null;
  last_checked_at: string | null;
  state_category: StateCategory;
  notify_not_indexed: boolean;
  notify_blocked: boolean;
  notify_recovered: boolean;
  channels: string[];
  created_at: string;
};

type HistoryPoint = {
  recorded_at: string;
  coverage_state: string | null;
  indexing_state: string | null;
  robots_state: string | null;
  last_crawled: string | null;
  is_indexable: boolean | null;
  google_canonical: string | null;
  user_canonical: string | null;
};

// ── Coverage state config ─────────────────────────────────────────────────────

const COVERAGE_CONFIG: Record<string, { label: string; short: string; bg: string; border: string; text: string; dot: string; icon: React.ElementType }> = {
  SUBMITTED_AND_INDEXED: {
    label: "Soumis et indexé", short: "Indexé",
    bg: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-500", icon: CheckCircle,
  },
  INDEXED_NOT_SUBMITTED_IN_SITEMAP: {
    label: "Indexé (hors sitemap)", short: "Indexé",
    bg: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-400", icon: CheckCircle,
  },
  CRAWLED_CURRENTLY_NOT_INDEXED: {
    label: "Explorée, actuellement non indexée", short: "Explorée non indexée",
    bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-500", icon: AlertTriangle,
  },
  DISCOVERED_CURRENTLY_NOT_INDEXED: {
    label: "Détectée, actuellement non indexée", short: "Détectée non indexée",
    bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", dot: "bg-yellow-500", icon: AlertTriangle,
  },
  NOT_INDEXED: {
    label: "Non indexée", short: "Non indexée",
    bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-600", dot: "bg-gray-400", icon: AlertTriangle,
  },
  BLOCKED_BY_ROBOTS_TXT: {
    label: "Bloquée par robots.txt", short: "Bloquée (robots)",
    bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500", icon: ShieldAlert,
  },
  BLOCKED_BY_META_TAG: {
    label: "Bloquée par balise meta (noindex)", short: "Bloquée (noindex)",
    bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500", icon: ShieldAlert,
  },
  BLOCKED_BY_HTTP_HEADER: {
    label: "Bloquée par en-tête HTTP", short: "Bloquée (header)",
    bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500", icon: ShieldAlert,
  },
  PAGE_WITH_REDIRECT: {
    label: "Page avec redirection", short: "Redirection",
    bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-400", icon: ArrowRight,
  },
  ALTERNATE_PAGE: {
    label: "Page alternative", short: "Alternative",
    bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500", dot: "bg-gray-300", icon: Eye,
  },
  DUPLICATE_WITHOUT_CANONICAL: {
    label: "Dupliquée sans canonique", short: "Dupliquée",
    bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-400", icon: AlertTriangle,
  },
  DUPLICATE_WITH_PROPER_CANONICAL: {
    label: "Dupliquée avec canonique valide", short: "Dupliquée (OK)",
    bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500", dot: "bg-gray-300", icon: Eye,
  },
  URL_UNKNOWN: {
    label: "Inconnue de Google", short: "Inconnue",
    bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500", dot: "bg-gray-400", icon: AlertTriangle,
  },
  SOFT_404: {
    label: "Soft 404", short: "Soft 404",
    bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-400", icon: AlertTriangle,
  },
  NOT_FOUND: {
    label: "Page introuvable (404)", short: "404",
    bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-400", icon: AlertTriangle,
  },
  SERVER_ERROR: {
    label: "Erreur serveur (5xx)", short: "Erreur serveur",
    bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500", icon: ShieldAlert,
  },
};

const DEFAULT_STATE = {
  label: "Inconnu", short: "Inconnu",
  bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-400", dot: "bg-gray-300", icon: Clock,
};

function CoverageBadge({ state }: { state: string | null }) {
  if (!state) return <span className="text-xs text-gray-300 font-medium">En attente…</span>;
  const cfg = COVERAGE_CONFIG[state] ?? DEFAULT_STATE;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon className="w-3 h-3" />
      {cfg.short}
    </span>
  );
}

// ── History Modal ─────────────────────────────────────────────────────────────

function HistoryModal({ monitor, websiteId, onClose }: { monitor: IndexationMonitor; websiteId: string; onClose: () => void }) {
  const { data: history = [], isLoading } = useQuery<HistoryPoint[]>({
    queryKey: ["indexation-history", websiteId, monitor.id],
    queryFn: async () => (await api.get(`/websites/${websiteId}/indexation/monitors/${monitor.id}/history`)).data,
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Historique — {monitor.label}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{monitor.url}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Chargement…</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Aucun historique disponible</div>
          ) : (
            <div className="space-y-3">
              {[...history].reverse().map((h, i) => {
                const cfg = h.coverage_state ? (COVERAGE_CONFIG[h.coverage_state] ?? DEFAULT_STATE) : DEFAULT_STATE;
                return (
                  <div key={i} className={`rounded-xl border p-4 ${cfg.border} ${cfg.bg}`}>
                    <div className="flex items-start justify-between">
                      <CoverageBadge state={h.coverage_state} />
                      <span className="text-xs text-gray-400">
                        {new Date(h.recorded_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      {h.indexing_state && <p>Indexation : <span className="font-medium">{h.indexing_state}</span></p>}
                      {h.robots_state && <p>Robots : <span className="font-medium">{h.robots_state}</span></p>}
                      {h.last_crawled && <p>Dernier crawl : {new Date(h.last_crawled).toLocaleDateString("fr-FR")}</p>}
                      {h.google_canonical && h.user_canonical && h.google_canonical !== h.user_canonical && (
                        <p className="text-orange-600">⚠️ Conflit canonique : Google → {h.google_canonical.replace(/^https?:\/\//, "")}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Monitor Card ──────────────────────────────────────────────────────────────

function MonitorCard({ monitor, websiteId, onDelete }: { monitor: IndexationMonitor; websiteId: string; onDelete: () => void }) {
  const qc = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const cfg = monitor.last_coverage_state
    ? (COVERAGE_CONFIG[monitor.last_coverage_state] ?? DEFAULT_STATE)
    : DEFAULT_STATE;
  const isProblematic = monitor.state_category === "not_indexed" || monitor.state_category === "blocked";

  const inspectMutation = useMutation({
    mutationFn: async () => api.post(`/websites/${websiteId}/indexation/monitors/${monitor.id}/inspect`),
    onSuccess: () => { setTimeout(() => qc.invalidateQueries({ queryKey: ["indexation-monitors", websiteId] }), 8000); },
  });

  const toggleMutation = useMutation({
    mutationFn: async () => api.put(`/websites/${websiteId}/indexation/monitors/${monitor.id}`, { is_active: !monitor.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["indexation-monitors", websiteId] }),
  });

  return (
    <>
      <div className={`bg-white rounded-xl border-2 transition-shadow hover:shadow-md ${isProblematic ? cfg.border : "border-gray-200"} ${!monitor.is_active ? "opacity-60" : ""}`}>
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isProblematic ? "animate-pulse " + cfg.dot : cfg.dot}`} />
                <p className="font-semibold text-gray-900 truncate">{monitor.label}</p>
              </div>
              <p className="text-xs text-gray-400 truncate ml-4" title={monitor.url}>
                {monitor.url.replace(/^https?:\/\//, "")}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
              <button onClick={() => inspectMutation.mutate()} disabled={inspectMutation.isPending}
                title="Inspecter maintenant"
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <RefreshCw className={`w-4 h-4 ${inspectMutation.isPending ? "animate-spin" : ""}`} />
              </button>
              <button onClick={() => setShowHistory(true)} title="Voir l'historique"
                className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors">
                <Eye className="w-4 h-4" />
              </button>
              <button onClick={() => toggleMutation.mutate()}
                className={`w-9 h-5 rounded-full relative transition-colors ${monitor.is_active ? "bg-blue-600" : "bg-gray-200"}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${monitor.is_active ? "translate-x-4" : ""}`} />
              </button>
              <button onClick={onDelete}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Coverage state */}
          <div className="mb-3">
            <CoverageBadge state={monitor.last_coverage_state} />
            {monitor.last_coverage_state && (
              <p className="text-xs text-gray-400 mt-1.5">
                {COVERAGE_CONFIG[monitor.last_coverage_state]?.label ?? monitor.last_coverage_state}
              </p>
            )}
          </div>

          {/* Details */}
          {monitor.last_coverage_state && (
            <div className="space-y-1.5 text-xs text-gray-500">
              {monitor.last_indexing_state && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-24 flex-shrink-0">Indexation</span>
                  <span className="font-medium text-gray-700">{monitor.last_indexing_state}</span>
                </div>
              )}
              {monitor.last_robots_state && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-24 flex-shrink-0">Robots</span>
                  <span className={`font-medium ${monitor.last_robots_state !== "ALLOWED" ? "text-red-600" : "text-gray-700"}`}>
                    {monitor.last_robots_state}
                  </span>
                </div>
              )}
              {monitor.last_crawl_time && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-24 flex-shrink-0">Dernier crawl</span>
                  <span className="text-gray-700">{new Date(monitor.last_crawl_time).toLocaleDateString("fr-FR")}</span>
                </div>
              )}
            </div>
          )}

          {/* Last checked */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {monitor.last_checked_at
                ? `Inspecté ${new Date(monitor.last_checked_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : "Pas encore inspecté"}
            </span>
            {monitor.channels.length > 0 && (
              <span className="flex items-center gap-1">
                <Bell className="w-3 h-3" />
                {monitor.channels.map((c) => c === "email" ? "📧" : "✈️").join("")}
              </span>
            )}
          </div>
        </div>
      </div>

      {showHistory && (
        <HistoryModal monitor={monitor} websiteId={websiteId} onClose={() => setShowHistory(false)} />
      )}
    </>
  );
}

// ── Add Monitor Modal ─────────────────────────────────────────────────────────

function AddMonitorModal({ websiteId, domain, onClose }: { websiteId: string; domain?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [urlsText, setUrlsText] = useState(`https://${domain ?? ""}`);
  const [notifyNotIndexed, setNotifyNotIndexed] = useState(true);
  const [notifyBlocked, setNotifyBlocked] = useState(true);
  const [notifyRecovered, setNotifyRecovered] = useState(true);
  const [channels, setChannels] = useState<string[]>(["email"]);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const urls = urlsText.split("\n").map((u) => u.trim()).filter(Boolean);
      await api.post(`/websites/${websiteId}/indexation/monitors`, {
        urls,
        notify_not_indexed: notifyNotIndexed,
        notify_blocked: notifyBlocked,
        notify_recovered: notifyRecovered,
        channels,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["indexation-monitors", websiteId] }); onClose(); },
    onError: (e: { response?: { data?: { detail?: string } } }) => setError(e?.response?.data?.detail ?? "Erreur"),
  });

  const toggleChannel = (ch: string) =>
    setChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Surveiller l'indexation de pages</h2>
            <p className="text-xs text-gray-400 mt-0.5">Via l'API Google Search Console URL Inspection</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* URLs */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              URL(s) à surveiller <span className="text-red-500">*</span>
            </label>
            <textarea
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              rows={4}
              placeholder={`https://example.com\nhttps://example.com/produit\nhttps://example.com/blog/article`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Une URL par ligne. L'inspection utilise l'API GSC URL Inspection (2000 req/jour).</p>
          </div>

          {/* Alert conditions */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Conditions d'alerte</label>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:border-orange-300 transition-colors border-orange-200 bg-orange-50">
                <input type="checkbox" checked={notifyNotIndexed} onChange={(e) => setNotifyNotIndexed(e.target.checked)}
                  className="mt-0.5 accent-orange-500" />
                <div>
                  <p className="text-sm font-semibold text-orange-800">Page non indexée ⚠️</p>
                  <div className="space-y-0.5 mt-1">
                    <p className="text-xs text-orange-700">• Explorée, actuellement non indexée</p>
                    <p className="text-xs text-orange-700">• Détectée, actuellement non indexée</p>
                    <p className="text-xs text-orange-600">Alerte quand une page indexée passe dans ces états</p>
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:border-red-300 transition-colors border-red-200 bg-red-50">
                <input type="checkbox" checked={notifyBlocked} onChange={(e) => setNotifyBlocked(e.target.checked)}
                  className="mt-0.5 accent-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Page bloquée 🔴</p>
                  <div className="space-y-0.5 mt-1">
                    <p className="text-xs text-red-700">• Bloquée par robots.txt</p>
                    <p className="text-xs text-red-700">• Bloquée par balise meta (noindex)</p>
                    <p className="text-xs text-red-700">• Bloquée par en-tête HTTP (X-Robots-Tag)</p>
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:border-green-300 transition-colors border-green-200 bg-green-50">
                <input type="checkbox" checked={notifyRecovered} onChange={(e) => setNotifyRecovered(e.target.checked)}
                  className="mt-0.5 accent-green-500" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Page récupérée ✅</p>
                  <p className="text-xs text-green-700">Alerte quand une page non indexée redevient indexée</p>
                </div>
              </label>
            </div>
          </div>

          {/* Channels */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Canaux de notification</label>
            <div className="flex gap-2">
              {[{ key: "email", label: "📧 Email" }, { key: "telegram", label: "✈️ Telegram" }].map((ch) => (
                <button key={ch.key} onClick={() => toggleChannel(ch.key)}
                  className={`px-4 py-1.5 rounded-lg border text-sm font-medium ${channels.includes(ch.key) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <strong>Données de la Search Console :</strong> L'inspection utilise l'API GSC URL Inspection pour récupérer l'état exact de chaque page — le même que vous voyez dans la Google Search Console.
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg border border-gray-200">Annuler</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !urlsText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Plus className="w-4 h-4" />
            {mutation.isPending ? "Ajout…" : "Ajouter et inspecter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IndexationPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | StateCategory>("all");

  const { data: monitors = [], isLoading } = useQuery<IndexationMonitor[]>({
    queryKey: ["indexation-monitors", id],
    queryFn: async () => (await api.get(`/websites/${id}/indexation/monitors`)).data,
    refetchInterval: 30000,
  });

  const { data: website } = useQuery({
    queryKey: ["website", id],
    queryFn: async () => (await api.get(`/websites/${id}`)).data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (monitorId: number) => api.delete(`/websites/${id}/indexation/monitors/${monitorId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["indexation-monitors", id] }),
  });

  const indexedCount = monitors.filter((m) => m.state_category === "indexed").length;
  const notIndexedCount = monitors.filter((m) => m.state_category === "not_indexed").length;
  const blockedCount = monitors.filter((m) => m.state_category === "blocked").length;
  const otherCount = monitors.filter((m) => m.state_category === "other" || m.state_category === "unknown").length;

  const filtered = filter === "all" ? monitors
    : filter === "not_indexed" ? monitors.filter((m) => m.state_category === "not_indexed")
    : filter === "blocked" ? monitors.filter((m) => m.state_category === "blocked")
    : filter === "indexed" ? monitors.filter((m) => m.state_category === "indexed")
    : monitors.filter((m) => m.state_category === "other" || m.state_category === "unknown");

  const FILTERS = [
    { key: "all" as const, label: "Toutes", count: monitors.length },
    { key: "indexed" as const, label: "Indexées", count: indexedCount, color: "text-green-700" },
    { key: "not_indexed" as const, label: "Non indexées", count: notIndexedCount, color: "text-orange-600" },
    { key: "blocked" as const, label: "Bloquées", count: blockedCount, color: "text-red-600" },
    { key: "other" as const, label: "Autres", count: otherCount, color: "text-gray-500" },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopNav title="Indexation" />
        <main className="p-6 space-y-6">

          <div className="flex items-center justify-between">
            <Link href={`/websites/${id}`} className="text-sm text-blue-600 hover:underline">← Retour au site</Link>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Ajouter des pages
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 h-48 animate-pulse" />)}
            </div>
          ) : monitors.length === 0 ? (
            /* ── Empty state ── */
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center max-w-2xl mx-auto">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Surveillez l'indexation de vos pages</h2>
              <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">
                Recevez des alertes quand Google cesse d'indexer vos pages importantes — basé sur les données réelles de la Search Console.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-8 text-left">
                {[
                  { state: "CRAWLED_CURRENTLY_NOT_INDEXED", desc: "Explorée par Google mais non indexée" },
                  { state: "DISCOVERED_CURRENTLY_NOT_INDEXED", desc: "Détectée mais pas encore explorée" },
                  { state: "BLOCKED_BY_ROBOTS_TXT", desc: "Bloquée par le fichier robots.txt" },
                  { state: "BLOCKED_BY_META_TAG", desc: "Balise noindex détectée" },
                ].map((item) => {
                  const cfg = COVERAGE_CONFIG[item.state];
                  const Icon = cfg.icon;
                  return (
                    <div key={item.state} className={`rounded-xl p-3 flex items-start gap-2 ${cfg.bg} border ${cfg.border}`}>
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.text}`} />
                      <div>
                        <p className={`text-xs font-semibold ${cfg.text}`}>{cfg.short}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 mx-auto">
                <Plus className="w-5 h-5" /> Ajouter ma première page
              </button>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-green-200 p-4 flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4 text-green-600" /></div>
                  <div>
                    <p className="text-2xl font-bold text-green-700">{indexedCount}</p>
                    <p className="text-xs text-gray-500">Indexées</p>
                  </div>
                </div>
                <div className={`bg-white rounded-xl border p-4 flex items-center gap-3 ${notIndexedCount > 0 ? "border-orange-200" : "border-gray-200"}`}>
                  <div className={`p-2 rounded-lg ${notIndexedCount > 0 ? "bg-orange-50" : "bg-gray-50"}`}>
                    <AlertTriangle className={`w-4 h-4 ${notIndexedCount > 0 ? "text-orange-500" : "text-gray-400"}`} />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${notIndexedCount > 0 ? "text-orange-600" : "text-gray-400"}`}>{notIndexedCount}</p>
                    <p className="text-xs text-gray-500">Non indexées</p>
                  </div>
                </div>
                <div className={`bg-white rounded-xl border p-4 flex items-center gap-3 ${blockedCount > 0 ? "border-red-200" : "border-gray-200"}`}>
                  <div className={`p-2 rounded-lg ${blockedCount > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                    <ShieldAlert className={`w-4 h-4 ${blockedCount > 0 ? "text-red-600" : "text-gray-400"}`} />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${blockedCount > 0 ? "text-red-600" : "text-gray-400"}`}>{blockedCount}</p>
                    <p className="text-xs text-gray-500">Bloquées</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="p-2 bg-gray-50 rounded-lg"><Search className="w-4 h-4 text-gray-500" /></div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{monitors.length}</p>
                    <p className="text-xs text-gray-500">Pages surveillées</p>
                  </div>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 bg-white border border-gray-200 p-1 rounded-xl w-fit flex-wrap">
                {FILTERS.map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                    {f.label}
                    {f.count > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${filter === f.key ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"}`}>
                        {f.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Monitor grid */}
              {filtered.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">Aucune page dans ce filtre</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((m) => (
                    <MonitorCard key={m.id} monitor={m} websiteId={id} onDelete={() => deleteMutation.mutate(m.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {showAdd && (
        <AddMonitorModal websiteId={id} domain={website?.domain} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}
