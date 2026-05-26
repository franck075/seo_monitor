"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { KeywordChanges } from "@/components/dashboard/KeywordChanges";
import Link from "next/link";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, MousePointerClick, Eye, Search, ChevronLeft, ChevronRight,
  ArrowUpDown, TrendingDown, Minus, Bell, BellOff, X, Check, Trash2,
} from "lucide-react";

const BUCKET_LABELS = [
  { key: "top3",   label: "Top 3",  color: "bg-green-500" },
  { key: "top10",  label: "4–10",   color: "bg-blue-500" },
  { key: "top20",  label: "11–20",  color: "bg-yellow-400" },
  { key: "top50",  label: "21–50",  color: "bg-orange-400" },
  { key: "plus50", label: "> 50",   color: "bg-gray-300" },
];

const PERIOD_OPTIONS = [
  { value: 7,   label: "7 jours" },
  { value: 28,  label: "28 jours" },
  { value: 90,  label: "90 jours" },
  { value: 180, label: "6 mois" },
];

type MonitoredKw = {
  id: number;
  keyword_id: number;
  query: string;
  channels: string[];
  notify_exit_top10: boolean;
  notify_enter_top10: boolean;
  notify_enter_top3: boolean;
  notify_rank1: boolean;
  last_known_position: number | null;
};

function StatCard({ label, value, sub, icon: Icon, color = "text-blue-600" }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`p-2 rounded-lg bg-gray-50 ${color}`}><Icon className="w-5 h-5" /></div>
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Monitor Modal ─────────────────────────────────────────────────────────────
function MonitorModal({
  websiteId, keyword, existingMonitor, onClose,
}: {
  websiteId: string;
  keyword: { id: number; query: string };
  existingMonitor?: MonitoredKw;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [channels, setChannels] = useState<string[]>(existingMonitor?.channels ?? ["email", "telegram"]);
  const [notifyExitTop10, setNotifyExitTop10] = useState(existingMonitor?.notify_exit_top10 ?? true);
  const [notifyEnterTop10, setNotifyEnterTop10] = useState(existingMonitor?.notify_enter_top10 ?? true);
  const [notifyEnterTop3, setNotifyEnterTop3] = useState(existingMonitor?.notify_enter_top3 ?? true);
  const [notifyRank1, setNotifyRank1] = useState(existingMonitor?.notify_rank1 ?? true);

  const toggleChannel = (ch: string) =>
    setChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        keyword_id: keyword.id,
        channels,
        notify_exit_top10: notifyExitTop10,
        notify_enter_top10: notifyEnterTop10,
        notify_enter_top3: notifyEnterTop3,
        notify_rank1: notifyRank1,
      };
      if (existingMonitor) {
        await api.put(`/websites/${websiteId}/keywords/monitors/${existingMonitor.id}`, body);
      } else {
        await api.post(`/websites/${websiteId}/keywords/monitors`, body);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kw-monitors", websiteId] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/websites/${websiteId}/keywords/monitors/${existingMonitor!.id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kw-monitors", websiteId] });
      onClose();
    },
  });

  const TRIGGERS = [
    { key: "notifyExitTop10",  label: "🔴 Sortie du Top 10",   value: notifyExitTop10,  set: setNotifyExitTop10 },
    { key: "notifyEnterTop10", label: "🟢 Entrée dans le Top 10", value: notifyEnterTop10, set: setNotifyEnterTop10 },
    { key: "notifyEnterTop3",  label: "🏆 Entrée dans le Top 3",  value: notifyEnterTop3,  set: setNotifyEnterTop3 },
    { key: "notifyRank1",      label: "🥇 1ère position",          value: notifyRank1,      set: setNotifyRank1 },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Surveiller ce mot-clé</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{keyword.query}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Triggers */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Alertes à envoyer</p>
            <div className="space-y-2">
              {TRIGGERS.map(({ key, label, value, set }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <button
                    type="button"
                    onClick={() => set(!value)}
                    className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${value ? "bg-blue-600" : "bg-gray-200"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? "translate-x-4" : ""}`} />
                  </button>
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Channels */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Canaux de notification</p>
            <div className="flex gap-2">
              {["email", "telegram"].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    channels.includes(ch)
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {ch === "email" ? "📧 Email" : "✈️ Telegram"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-5 border-t border-gray-100">
          {existingMonitor && (
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
            >
              <Trash2 className="w-4 h-4" /> Supprimer
            </button>
          )}
          <button onClick={onClose} className="ml-auto px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200">
            Annuler
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || channels.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {existingMonitor ? "Mettre à jour" : "Activer la surveillance"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KeywordsPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("clicks");
  const [posMax, setPosMax] = useState<string>("");
  const [page, setPage] = useState(0);
  const [period, setPeriod] = useState(28);
  const [activeTab, setActiveTab] = useState<"clicks" | "impressions">("clicks");
  const [monitorModal, setMonitorModal] = useState<{ id: number; query: string } | null>(null);
  const [activeSection, setActiveSection] = useState<"all" | "monitored">("all");
  const LIMIT = 50;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["keywords-stats", id, period],
    queryFn: async () => (await api.get(`/websites/${id}/keywords/live-stats?period=${period}`)).data,
    staleTime: 5 * 60 * 1000, // cache 5 minutes
  });

  const { data: kwData, isLoading: kwLoading } = useQuery({
    queryKey: ["keywords", id, search, sortBy, posMax, page, period],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: String(LIMIT), offset: String(page * LIMIT), sort_by: sortBy, period: String(period) });
      if (search) p.set("search", search);
      if (posMax) p.set("position_max", posMax);
      return (await api.get(`/websites/${id}/keywords?${p}`)).data;
    },
  });

  const { data: monitors = [] } = useQuery<MonitoredKw[]>({
    queryKey: ["kw-monitors", id],
    queryFn: async () => (await api.get(`/websites/${id}/keywords/monitors`)).data,
  });

  const monitoredIds = new Set(monitors.map((m) => m.keyword_id));

  const keywords = kwData?.data ?? [];
  const total = kwData?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  function applySearch() { setSearch(searchInput); setPage(0); }

  const positionBuckets = stats?.position_buckets ?? {};
  const bucketTotal = Object.values(positionBuckets).reduce((a: number, b) => a + (b as number), 0) || 1;

  const selectedKw = monitorModal;
  const existingMonitor = selectedKw ? monitors.find((m) => m.keyword_id === selectedKw.id) : undefined;

  const [showResyncConfirm, setShowResyncConfirm] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const { data: debugData, isLoading: debugLoading, refetch: runDebug } = useQuery({
    queryKey: ["gsc-debug", id],
    queryFn: async () => (await api.get(`/websites/${id}/gsc-debug`)).data,
    enabled: false,
  });

  const [resyncResult, setResyncResult] = useState<{total_rows_imported: number; latest_date_stored: string | null; errors: string[]} | null>(null);

  const resyncMutation = useMutation({
    mutationFn: async () => (await api.post(`/websites/${id}/full-resync`)).data,
    onSuccess: (data) => {
      setShowResyncConfirm(false);
      setResyncResult(data);
      qc.invalidateQueries({ queryKey: ["keywords-stats", id, period] });
      qc.invalidateQueries({ queryKey: ["keywords", id] });
    },
  });

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopNav title="Mots-clés" />
        <main className="p-6 space-y-6">

          {/* Debug modal */}
          {showDebug && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900">Diagnostic GSC</h3>
                  <button onClick={() => setShowDebug(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                {debugLoading && <p className="text-sm text-gray-500">Appel API GSC en cours...</p>}
                {debugData && (
                  <div className="space-y-3 text-sm">
                    {debugData.error ? (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 font-mono text-xs">{debugData.error}</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 mb-1">Période demandée</p>
                            <p className="font-mono text-xs">{debugData.requested_range?.start} → {debugData.requested_range?.end}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 mb-1">Lignes retournées par GSC</p>
                            <p className="font-bold text-gray-900">{debugData.total_rows_returned}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 mb-1">Date la plus récente dans GSC API</p>
                            <p className="font-bold text-blue-600">{debugData.latest_date_in_api ?? "Aucune"}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 mb-1">Dates avec données</p>
                            <p className="font-mono text-xs">{debugData.dates_with_data?.join(", ") || "—"}</p>
                          </div>
                        </div>
                        {debugData.sample_row && (
                          <div className="bg-blue-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500 mb-1">Exemple de ligne retournée</p>
                            <pre className="font-mono text-xs text-gray-700 whitespace-pre-wrap">{JSON.stringify(debugData.sample_row, null, 2)}</pre>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resync confirm modal */}
          {showResyncConfirm && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
                <h3 className="font-bold text-gray-900 mb-2">Synchronisation complète GSC</h3>

                {resyncMutation.isPending ? (
                  <div className="text-center py-6">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-600">Synchronisation en cours...<br /><span className="text-xs text-gray-400">6 mois de données, patientez 1 à 2 minutes</span></p>
                  </div>
                ) : resyncMutation.isSuccess && resyncResult ? (
                  <div className="space-y-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                      <p className="font-semibold text-green-800">✓ Sync terminée</p>
                      <p className="text-green-700 mt-1">Date la plus récente : <strong>{resyncResult.latest_date_stored}</strong></p>
                      <p className="text-green-700">Lignes importées : <strong>{resyncResult.total_rows_imported.toLocaleString()}</strong></p>
                    </div>
                    {resyncResult.errors.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                        {resyncResult.errors.length} erreur(s) : {resyncResult.errors[0]}
                      </div>
                    )}
                    <button onClick={() => setShowResyncConfirm(false)} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700">
                      Fermer
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-4">
                      Toutes les données mots-clés vont être effacées et re-importées directement depuis la Google Search Console (6 mois d&apos;historique). Durée : 1 à 2 minutes.
                    </p>
                    <div className="flex gap-3">
                      <button onClick={() => setShowResyncConfirm(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
                      <button
                        onClick={() => resyncMutation.mutate()}
                        className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700"
                      >
                        Lancer la sync
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Link href={`/websites/${id}`} className="text-sm text-blue-600 hover:underline">← Retour au site</Link>
            <div className="flex items-center gap-3">
              {stats?.latest_date && (
                <span className="text-xs text-gray-400">Données au {new Date(stats.latest_date + "T12:00:00").toLocaleDateString("fr-FR")}</span>
              )}
              <button
                onClick={() => { setShowDebug(true); runDebug(); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Diagnostic GSC
              </button>
              <button
                onClick={() => { setResyncResult(null); setShowResyncConfirm(true); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors font-medium"
              >
                ↻ Sync. complète GSC
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          {statsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />)}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Mots-clés" value={stats.total_keywords.toLocaleString()} icon={Search} color="text-blue-600" />
              <StatCard label="Position moyenne" value={stats.avg_position ?? "—"} sub="plus bas = meilleur" icon={TrendingUp} color="text-purple-600" />
              <StatCard label="Clics totaux" value={(stats.total_clicks ?? 0).toLocaleString()} icon={MousePointerClick} color="text-green-600" />
              <StatCard label="Impressions" value={(stats.total_impressions ?? 0).toLocaleString()} sub={`CTR moyen ${stats.avg_ctr ?? 0}%`} icon={Eye} color="text-orange-500" />
            </div>
          ) : null}

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Évolution sur 30 jours</h2>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                  {(["clicks", "impressions"] as const).map((t) => (
                    <button key={t} onClick={() => setActiveTab(t)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeTab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                      {t === "clicks" ? "Clics" : "Impressions"}
                    </button>
                  ))}
                </div>
              </div>
              {stats?.clicks_trend?.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={stats.clicks_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(val: number) => val.toLocaleString()} labelFormatter={(d) => new Date(d).toLocaleDateString("fr-FR")} />
                    {activeTab === "clicks"
                      ? <Area type="monotone" dataKey="clicks" stroke="#3b82f6" fill="#dbeafe" name="Clics" />
                      : <Area type="monotone" dataKey="impressions" stroke="#8b5cf6" fill="#ede9fe" name="Impressions" />}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-52 flex items-center justify-center text-gray-300 text-sm">Aucune donnée</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Répartition des positions</h2>
              <div className="space-y-3">
                {BUCKET_LABELS.map(({ key, label, color }) => {
                  const count = positionBuckets[key] ?? 0;
                  const pct = Math.round((count / bucketTotal) * 100);
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span className="font-medium">{label}</span>
                        <span>{count.toLocaleString()} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Top 5 par clics</h3>
                <div className="space-y-2">
                  {(stats?.top_keywords ?? []).slice(0, 5).map((kw: { query: string; clicks: number; position: number }) => (
                    <div key={kw.query} className="flex items-center gap-2">
                      <span className="flex-1 text-xs text-gray-700 truncate" title={kw.query}>{kw.query}</span>
                      <span className="text-xs font-medium text-blue-700 shrink-0">{kw.clicks} clics</span>
                      <span className="text-xs text-gray-400 shrink-0 w-12 text-right">#{kw.position?.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Top 10 bar chart */}
          {stats?.top_keywords?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Top 10 mots-clés par clics</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.top_keywords} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="query" tick={{ fontSize: 10 }} width={160}
                    tickFormatter={(v) => v.length > 25 ? v.slice(0, 25) + "…" : v} />
                  <Tooltip formatter={(val: number) => val.toLocaleString()} />
                  <Bar dataKey="clicks" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Clics" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Évolution des mots-clés (comparaison période) */}
          <KeywordChanges siteId={id} />

          {/* Section tabs */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center gap-1 p-3 border-b border-gray-100">
              <button
                onClick={() => setActiveSection("all")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeSection === "all" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-50"}`}
              >
                Tous les mots-clés
              </button>
              <button
                onClick={() => setActiveSection("monitored")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeSection === "monitored" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-50"}`}
              >
                <Bell className="w-4 h-4" />
                Surveillés
                {monitors.length > 0 && (
                  <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{monitors.length}</span>
                )}
              </button>
            </div>

            {/* ── Monitored keywords list ── */}
            {activeSection === "monitored" && (
              <div>
                {monitors.length === 0 ? (
                  <div className="p-10 text-center text-gray-400">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aucun mot-clé surveillé.</p>
                    <p className="text-xs mt-1">Cliquez sur la cloche dans le tableau pour surveiller un mot-clé.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Mot-clé</th>
                        <th className="px-4 py-3 text-center">Sortie Top 10</th>
                        <th className="px-4 py-3 text-center">Entrée Top 10</th>
                        <th className="px-4 py-3 text-center">Top 3</th>
                        <th className="px-4 py-3 text-center">1ère pos.</th>
                        <th className="px-4 py-3 text-center">Canaux</th>
                        <th className="px-4 py-3 text-right">Position actuelle</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {monitors.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate" title={m.query}>{m.query}</td>
                          <td className="px-4 py-3 text-center">{m.notify_exit_top10 ? <span className="text-red-500">🔴</span> : <span className="text-gray-200">—</span>}</td>
                          <td className="px-4 py-3 text-center">{m.notify_enter_top10 ? <span className="text-green-500">🟢</span> : <span className="text-gray-200">—</span>}</td>
                          <td className="px-4 py-3 text-center">{m.notify_enter_top3 ? <span>🏆</span> : <span className="text-gray-200">—</span>}</td>
                          <td className="px-4 py-3 text-center">{m.notify_rank1 ? <span>🥇</span> : <span className="text-gray-200">—</span>}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex justify-center gap-1">
                              {m.channels.map((ch) => (
                                <span key={ch} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                                  {ch === "email" ? "📧" : "✈️"} {ch}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-gray-700">
                            {m.last_known_position != null ? `#${m.last_known_position.toFixed(0)}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setMonitorModal({ id: m.keyword_id, query: m.query })}
                              className="text-blue-600 hover:text-blue-800 text-xs underline"
                            >
                              Modifier
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── All keywords table ── */}
            {activeSection === "all" && (
              <>
                <div className="p-4 border-b border-gray-100">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex gap-2 flex-1 min-w-[200px]">
                      <input
                        type="text"
                        placeholder="Rechercher un mot-clé..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && applySearch()}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button onClick={applySearch} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                    <select value={posMax} onChange={(e) => { setPosMax(e.target.value); setPage(0); }}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
                      <option value="">Toutes positions</option>
                      <option value="3">Top 3</option>
                      <option value="10">Top 10</option>
                      <option value="20">Top 20</option>
                      <option value="50">Top 50</option>
                    </select>
                    <select value={period} onChange={(e) => { setPeriod(Number(e.target.value)); setPage(0); }}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
                      {PERIOD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(0); }}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
                      <option value="clicks">Trier par clics</option>
                      <option value="impressions">Trier par impressions</option>
                      <option value="position">Trier par position</option>
                      <option value="ctr">Trier par CTR</option>
                    </select>
                    <span className="text-xs text-gray-400 ml-auto">{total.toLocaleString()} résultats</span>
                  </div>
                </div>

                {kwLoading ? (
                  <div className="p-8 text-center text-gray-400">Chargement...</div>
                ) : keywords.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">Aucun mot-clé trouvé.</div>
                ) : (
                  <>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-3 text-left">Requête</th>
                          <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-700"
                            onClick={() => { setSortBy("position"); setPage(0); }}>
                            <span className="flex items-center justify-end gap-1">Position moy. (7j) <ArrowUpDown className="w-3 h-3" /></span>
                          </th>
                          <th className="px-4 py-3 text-center">Variation (sem.)</th>
                          <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-700"
                            onClick={() => { setSortBy("clicks"); setPage(0); }}>
                            <span className="flex items-center justify-end gap-1">Clics ({period}j) <ArrowUpDown className="w-3 h-3" /></span>
                          </th>
                          <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-700"
                            onClick={() => { setSortBy("impressions"); setPage(0); }}>
                            <span className="flex items-center justify-end gap-1">Impressions ({period}j) <ArrowUpDown className="w-3 h-3" /></span>
                          </th>
                          <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-700"
                            onClick={() => { setSortBy("ctr"); setPage(0); }}>
                            <span className="flex items-center justify-end gap-1">CTR moy. <ArrowUpDown className="w-3 h-3" /></span>
                          </th>
                          <th className="px-4 py-3 text-center w-12">
                            <Bell className="w-3.5 h-3.5 mx-auto text-gray-400" />
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {keywords.map((kw: {
                          id: number; query: string; page?: string;
                          position?: number; position_change?: number;
                          clicks?: number; impressions?: number; ctr?: number;
                        }) => {
                          const posColor =
                            kw.position == null ? "text-gray-400"
                            : kw.position <= 3 ? "text-green-600 font-bold"
                            : kw.position <= 10 ? "text-blue-600 font-semibold"
                            : kw.position <= 20 ? "text-yellow-600"
                            : "text-gray-500";

                          const change = kw.position_change;
                          const changeEl = change == null ? (
                            <span className="text-gray-300"><Minus className="w-3 h-3 inline" /></span>
                          ) : change > 0 ? (
                            <span className="flex items-center justify-center gap-0.5 text-green-600 font-semibold text-xs">
                              <TrendingUp className="w-3 h-3" />+{change}
                            </span>
                          ) : change < 0 ? (
                            <span className="flex items-center justify-center gap-0.5 text-red-500 font-semibold text-xs">
                              <TrendingDown className="w-3 h-3" />{change}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs"><Minus className="w-3 h-3 inline" /></span>
                          );

                          const isMonitored = monitoredIds.has(kw.id);

                          return (
                            <tr key={kw.id} className="hover:bg-gray-50 group">
                              <td className="px-4 py-2.5 font-medium text-gray-900 max-w-xs truncate" title={kw.query}>
                                {kw.query}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-mono ${posColor}`}>
                                {kw.position != null ? `#${kw.position}` : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-center">{changeEl}</td>
                              <td className="px-4 py-2.5 text-right text-gray-700 font-medium">{kw.clicks?.toLocaleString() ?? "—"}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600">{kw.impressions?.toLocaleString() ?? "—"}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600">{kw.ctr != null ? `${kw.ctr}%` : "—"}</td>
                              <td className="px-4 py-2.5 text-center">
                                <button
                                  title={isMonitored ? "Surveiller (actif)" : "Surveiller ce mot-clé"}
                                  onClick={() => setMonitorModal({ id: kw.id, query: kw.query })}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    isMonitored
                                      ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
                                      : "text-gray-300 hover:text-gray-500 hover:bg-gray-100 opacity-0 group-hover:opacity-100"
                                  }`}
                                >
                                  {isMonitored ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                        <span className="text-xs text-gray-500">
                          Page {page + 1} sur {totalPages} · {total.toLocaleString()} mots-clés
                        </span>
                        <div className="flex gap-1">
                          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                            className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50">
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                            className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Monitor modal */}
      {monitorModal && (
        <MonitorModal
          websiteId={id}
          keyword={monitorModal}
          existingMonitor={existingMonitor}
          onClose={() => setMonitorModal(null)}
        />
      )}
    </div>
  );
}
