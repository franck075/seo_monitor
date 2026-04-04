"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Plus, Trash2, RefreshCw, Bell, X, Check, Shield, AlertTriangle,
  CheckCircle, Clock, Zap, ChevronDown, ChevronUp, ExternalLink, ArrowRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusCategory = "ok" | "redirect" | "error_4xx" | "error_5xx" | "timeout";

type HTTPMonitor = {
  id: number;
  url: string;
  label: string;
  is_active: boolean;
  check_frequency: string;
  notify_on_error: boolean;
  notify_on_redirect: boolean;
  notify_on_slow: boolean;
  slow_threshold_ms: number;
  channels: string[];
  last_status_code: number | null;
  last_response_time: number | null;
  last_checked_at: string | null;
  uptime_pct: number | null;
  status_category: StatusCategory;
};

type HistoryPoint = {
  checked_at: string;
  status_code: number | null;
  response_time: number | null;
  is_error: boolean;
  redirect_url: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusCategory, { label: string; bg: string; border: string; text: string; dot: string; icon: React.ElementType }> = {
  ok: { label: "OK", bg: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-500", icon: CheckCircle },
  redirect: { label: "Redirection", bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", dot: "bg-yellow-500", icon: ArrowRight },
  error_4xx: { label: "Erreur 4xx", bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-500", icon: AlertTriangle },
  error_5xx: { label: "Erreur 5xx", bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500", icon: AlertTriangle },
  timeout: { label: "Timeout", bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-600", dot: "bg-gray-400", icon: Clock },
};

const CODE_DESCRIPTIONS: Record<number, string> = {
  200: "OK — La page est accessible",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently — Redirection permanente",
  302: "Found — Redirection temporaire",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized — Authentification requise",
  403: "Forbidden — Accès refusé",
  404: "Not Found — Page introuvable",
  410: "Gone — Page supprimée définitivement",
  429: "Too Many Requests",
  500: "Internal Server Error — Erreur serveur",
  502: "Bad Gateway",
  503: "Service Unavailable — Serveur hors ligne",
  504: "Gateway Timeout",
};

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ code }: { code?: number | null }) {
  if (!code) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500 font-mono">—</span>;
  const cat: StatusCategory = code >= 500 ? "error_5xx" : code >= 400 ? "error_4xx" : code >= 300 ? "redirect" : "ok";
  const cfg = STATUS_CONFIG[cat];
  return (
    <span title={CODE_DESCRIPTIONS[code] ?? ""} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold font-mono ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {code}
    </span>
  );
}

// ── Uptime Bar ────────────────────────────────────────────────────────────────

function UptimeBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-gray-300">—</span>;
  const color = pct >= 99 ? "text-green-600" : pct >= 95 ? "text-yellow-600" : "text-red-600";
  const barColor = pct >= 99 ? "bg-green-500" : pct >= 95 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold ${color}`}>{pct}%</span>
    </div>
  );
}

// ── History Chart Modal ───────────────────────────────────────────────────────

function HistoryModal({ monitor, websiteId, onClose }: { monitor: HTTPMonitor; websiteId: string; onClose: () => void }) {
  const { data: history = [], isLoading } = useQuery<HistoryPoint[]>({
    queryKey: ["http-history", websiteId, monitor.id],
    queryFn: async () => (await api.get(`/websites/${websiteId}/http-checks/monitors/${monitor.id}/history?limit=30`)).data,
  });

  const chartData = history.map((h) => ({
    time: new Date(h.checked_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    rt: h.response_time != null ? Math.round(h.response_time) : null,
    code: h.status_code,
    error: h.is_error,
  }));

  const avgRt = chartData.filter((d) => d.rt != null).reduce((s, d) => s + (d.rt ?? 0), 0) / (chartData.filter((d) => d.rt != null).length || 1);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Historique — {monitor.label}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{monitor.url}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-5">
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-gray-400">Chargement…</div>
          ) : chartData.length < 2 ? (
            <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Pas encore assez de données</div>
          ) : (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-3">Temps de réponse (ms) — {chartData.length} vérifications</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} unit="ms" />
                  <Tooltip formatter={(v: number) => [`${v}ms`, "Temps de réponse"]} />
                  <ReferenceLine y={avgRt} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: `moy.`, fontSize: 10, fill: "#94a3b8" }} />
                  <ReferenceLine y={monitor.slow_threshold_ms} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: `seuil`, fontSize: 10, fill: "#f59e0b" }} />
                  <Line type="monotone" dataKey="rt" stroke="#3b82f6" strokeWidth={2} dot={(p) => p.payload.error ? <circle cx={p.cx} cy={p.cy} r={4} fill="#ef4444" /> : <circle cx={p.cx} cy={p.cy} r={2} fill="#3b82f6" />} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* History table */}
          {history.length > 0 && (
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-center">Code</th>
                    <th className="px-3 py-2 text-right">Temps</th>
                    <th className="px-3 py-2 text-left">Redirection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...history].reverse().map((h, i) => (
                    <tr key={i} className={h.is_error ? "bg-red-50" : ""}>
                      <td className="px-3 py-2 text-gray-500">
                        {new Date(h.checked_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2 text-center"><StatusBadge code={h.status_code} /></td>
                      <td className="px-3 py-2 text-right text-gray-600 font-mono">
                        {h.response_time != null ? `${Math.round(h.response_time)}ms` : "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-400 truncate max-w-[160px]" title={h.redirect_url ?? ""}>
                        {h.redirect_url ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Monitor Card ──────────────────────────────────────────────────────────────

function MonitorCard({ monitor, websiteId, onDelete }: {
  monitor: HTTPMonitor; websiteId: string; onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const cat = STATUS_CONFIG[monitor.status_category];
  const Icon = cat.icon;

  const checkMutation = useMutation({
    mutationFn: async () => api.post(`/websites/${websiteId}/http-checks/monitors/${monitor.id}/check`),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ["http-monitors", websiteId] }), 4000);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async () => api.put(`/websites/${websiteId}/http-checks/monitors/${monitor.id}`, { is_active: !monitor.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["http-monitors", websiteId] }),
  });

  const isError = monitor.status_category === "error_4xx" || monitor.status_category === "error_5xx" || monitor.status_category === "timeout";

  return (
    <>
      <div className={`bg-white rounded-xl border-2 transition-shadow hover:shadow-md ${isError ? cat.border : "border-gray-200"} ${!monitor.is_active ? "opacity-60" : ""}`}>
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {monitor.last_checked_at ? (
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isError ? "animate-pulse " + cat.dot : cat.dot}`} />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                )}
                <p className="font-semibold text-gray-900 truncate">{monitor.label}</p>
              </div>
              <p className="text-xs text-gray-400 truncate ml-4" title={monitor.url}>
                {monitor.url.replace(/^https?:\/\//, "")}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-2">
              <button onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}
                title="Vérifier maintenant"
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <RefreshCw className={`w-4 h-4 ${checkMutation.isPending ? "animate-spin" : ""}`} />
              </button>
              <button onClick={() => setShowHistory(true)} title="Voir l'historique"
                className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors">
                <Zap className="w-4 h-4" />
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

          {/* Status + code */}
          <div className="flex items-center gap-3 mb-3">
            {monitor.last_status_code ? (
              <StatusBadge code={monitor.last_status_code} />
            ) : (
              <span className="text-xs text-gray-400">En attente…</span>
            )}
            {monitor.last_status_code && (
              <span className="text-xs text-gray-500 truncate">
                {CODE_DESCRIPTIONS[monitor.last_status_code] ?? ""}
              </span>
            )}
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Temps de réponse</p>
              <p className={`text-sm font-semibold ${monitor.last_response_time && monitor.last_response_time > monitor.slow_threshold_ms ? "text-orange-600" : "text-gray-800"}`}>
                {monitor.last_response_time != null ? `${Math.round(monitor.last_response_time)}ms` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Disponibilité</p>
              <UptimeBar pct={monitor.uptime_pct} />
            </div>
          </div>

          {/* Last checked */}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {monitor.last_checked_at
                ? `Vérifié ${new Date(monitor.last_checked_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : "Pas encore vérifié"}
            </span>
            <span className="text-xs text-gray-400">
              {monitor.check_frequency === "hourly" ? "Toutes les heures" : monitor.check_frequency === "daily" ? "Quotidien" : "Hebdo"}
            </span>
          </div>

          {/* Redirect chain info */}
          {monitor.status_category === "redirect" && (
            <div className="mt-3 p-2 bg-yellow-50 rounded-lg flex items-start gap-1.5 text-xs text-yellow-700">
              <ArrowRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>Cette page effectue une redirection</span>
            </div>
          )}
        </div>

        {/* Notifications row */}
        {monitor.channels.length > 0 && (
          <div className="px-5 pb-3 flex items-center gap-1.5">
            <Bell className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-400">Alertes via {monitor.channels.map((c) => c === "email" ? "📧" : "✈️").join(" ")}</span>
          </div>
        )}
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
  const [frequency, setFrequency] = useState("daily");
  const [notifyError, setNotifyError] = useState(true);
  const [notifyRedirect, setNotifyRedirect] = useState(false);
  const [notifySlow, setNotifySlow] = useState(false);
  const [slowMs, setSlowMs] = useState(3000);
  const [channels, setChannels] = useState<string[]>(["email"]);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const urls = urlsText.split("\n").map((u) => u.trim()).filter(Boolean);
      await api.post(`/websites/${websiteId}/http-checks/monitors`, {
        urls,
        check_frequency: frequency,
        notify_on_error: notifyError,
        notify_on_redirect: notifyRedirect,
        notify_on_slow: notifySlow,
        slow_threshold_ms: slowMs,
        channels,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["http-monitors", websiteId] }); onClose(); },
    onError: (e: { response?: { data?: { detail?: string } } }) => setError(e?.response?.data?.detail ?? "Erreur"),
  });

  const toggleChannel = (ch: string) =>
    setChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Ajouter des URL à surveiller</h2>
            <p className="text-xs text-gray-400 mt-0.5">Surveillance des codes HTTP et des temps de réponse</p>
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
              placeholder={`https://example.com\nhttps://example.com/blog\nhttps://example.com/contact`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Une URL par ligne. Plusieurs URL créeront des moniteurs distincts.</p>
          </div>

          {/* Frequency */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Fréquence</label>
            <div className="flex gap-2">
              {[
                { value: "hourly", label: "Toutes les heures" },
                { value: "daily", label: "Tous les jours" },
                { value: "weekly", label: "Chaque semaine" },
              ].map((f) => (
                <button key={f.value} onClick={() => setFrequency(f.value)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${frequency === f.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Alert conditions */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Alertes</label>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 transition-colors">
                <input type="checkbox" checked={notifyError} onChange={(e) => setNotifyError(e.target.checked)}
                  className="mt-0.5 accent-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Erreurs 4xx / 5xx</p>
                  <p className="text-xs text-gray-400">Alerte quand la page devient inaccessible (404, 500, timeout…)</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 transition-colors">
                <input type="checkbox" checked={notifyRedirect} onChange={(e) => setNotifyRedirect(e.target.checked)}
                  className="mt-0.5 accent-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Redirections (3xx)</p>
                  <p className="text-xs text-gray-400">Alerte quand une nouvelle redirection est détectée</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 transition-colors">
                <input type="checkbox" checked={notifySlow} onChange={(e) => setNotifySlow(e.target.checked)}
                  className="mt-0.5 accent-blue-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">Réponse lente</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-gray-400">Seuil :</p>
                    <input type="number" value={slowMs} onChange={(e) => setSlowMs(Number(e.target.value))}
                      disabled={!notifySlow}
                      className="w-24 border border-gray-200 rounded px-2 py-0.5 text-xs disabled:opacity-40"
                      min={500} max={30000} step={500} />
                    <span className="text-xs text-gray-400">ms</span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Channels */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Canaux de notification</label>
            <div className="flex gap-2">
              {[
                { key: "email", label: "📧 Email" },
                { key: "telegram", label: "✈️ Telegram" },
              ].map((ch) => (
                <button key={ch.key} onClick={() => toggleChannel(ch.key)}
                  className={`px-4 py-1.5 rounded-lg border text-sm font-medium ${channels.includes(ch.key) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Code descriptions reference */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Codes de référence</p>
            <div className="grid grid-cols-2 gap-1">
              {[[200, "bg-green-100 text-green-700"], [301, "bg-yellow-100 text-yellow-700"], [404, "bg-orange-100 text-orange-700"], [403, "bg-orange-100 text-orange-700"], [500, "bg-red-100 text-red-700"], [503, "bg-red-100 text-red-700"]].map(([code, cls]) => (
                <div key={code} className="flex items-center gap-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded font-bold font-mono ${cls}`}>{code}</span>
                  <span className="text-gray-500 truncate">{CODE_DESCRIPTIONS[code as number]?.split(" — ")[0]}</span>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg border border-gray-200">Annuler</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !urlsText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Plus className="w-4 h-4" />
            {mutation.isPending ? "Ajout…" : "Ajouter et vérifier"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HTTPChecksPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | StatusCategory>("all");

  const { data: monitors = [], isLoading } = useQuery<HTTPMonitor[]>({
    queryKey: ["http-monitors", id],
    queryFn: async () => (await api.get(`/websites/${id}/http-checks/monitors`)).data,
    refetchInterval: 30000,
  });

  const { data: website } = useQuery({
    queryKey: ["website", id],
    queryFn: async () => (await api.get(`/websites/${id}`)).data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (monitorId: number) => api.delete(`/websites/${id}/http-checks/monitors/${monitorId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["http-monitors", id] }),
  });

  // Stats
  const total = monitors.length;
  const okCount = monitors.filter((m) => m.status_category === "ok").length;
  const redirectCount = monitors.filter((m) => m.status_category === "redirect").length;
  const errorCount = monitors.filter((m) => m.status_category === "error_4xx" || m.status_category === "error_5xx" || m.status_category === "timeout").length;
  const avgRt = monitors.filter((m) => m.last_response_time != null).length > 0
    ? Math.round(monitors.filter((m) => m.last_response_time != null).reduce((s, m) => s + (m.last_response_time ?? 0), 0) / monitors.filter((m) => m.last_response_time != null).length)
    : null;

  const filtered = filter === "all" ? monitors : monitors.filter((m) => {
    if (filter === "error_4xx") return m.status_category === "error_4xx" || m.status_category === "error_5xx" || m.status_category === "timeout";
    return m.status_category === filter;
  });

  const FILTERS: { key: "all" | StatusCategory; label: string; count?: number }[] = [
    { key: "all", label: "Toutes", count: total },
    { key: "ok", label: "OK (2xx)", count: okCount },
    { key: "redirect", label: "Redirect (3xx)", count: redirectCount },
    { key: "error_4xx", label: "Erreurs (4xx/5xx)", count: errorCount },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopNav title="Statuts HTTP" />
        <main className="p-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <Link href={`/websites/${id}`} className="text-sm text-blue-600 hover:underline">← Retour au site</Link>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Ajouter des URL
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
                <Shield className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Surveillez vos statuts HTTP</h2>
              <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">
                Détectez les erreurs 4xx, les pannes serveur 5xx et les redirections avant qu'elles n'impactent votre référencement.
              </p>
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { code: "200", label: "Page OK", color: "bg-green-100 text-green-700", desc: "Accessible et indexable" },
                  { code: "301", label: "Redirection", color: "bg-yellow-100 text-yellow-700", desc: "Chaîne de redirections détectée" },
                  { code: "404", label: "Page absente", color: "bg-orange-100 text-orange-700", desc: "Erreur client à corriger" },
                  { code: "403", label: "Accès refusé", color: "bg-orange-100 text-orange-700", desc: "Googlebot bloqué" },
                  { code: "500", label: "Erreur serveur", color: "bg-red-100 text-red-700", desc: "Panne critique" },
                  { code: "503", label: "Hors ligne", color: "bg-red-100 text-red-700", desc: "Site indisponible" },
                ].map((item) => (
                  <div key={item.code} className="bg-gray-50 rounded-xl p-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-sm font-bold font-mono mb-1.5 ${item.color}`}>{item.code}</span>
                    <p className="text-xs font-semibold text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 mx-auto">
                <Plus className="w-5 h-5" /> Ajouter ma première page
              </button>
            </div>
          ) : (
            <>
              {/* Stats bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg"><Shield className="w-4 h-4 text-blue-600" /></div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{total}</p>
                    <p className="text-xs text-gray-500">Pages surveillées</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-green-200 p-4 flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4 text-green-600" /></div>
                  <div>
                    <p className="text-2xl font-bold text-green-700">{okCount}</p>
                    <p className="text-xs text-gray-500">Pages OK</p>
                  </div>
                </div>
                <div className={`bg-white rounded-xl border p-4 flex items-center gap-3 ${errorCount > 0 ? "border-red-200" : "border-gray-200"}`}>
                  <div className={`p-2 rounded-lg ${errorCount > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                    <AlertTriangle className={`w-4 h-4 ${errorCount > 0 ? "text-red-600" : "text-gray-400"}`} />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${errorCount > 0 ? "text-red-600" : "text-gray-400"}`}>{errorCount}</p>
                    <p className="text-xs text-gray-500">Erreurs</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="p-2 bg-gray-50 rounded-lg"><Zap className="w-4 h-4 text-gray-500" /></div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{avgRt != null ? `${avgRt}ms` : "—"}</p>
                    <p className="text-xs text-gray-500">Temps moyen</p>
                  </div>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 bg-white border border-gray-200 p-1 rounded-xl w-fit">
                {FILTERS.map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                    {f.label}
                    {f.count != null && f.count > 0 && (
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
                    <MonitorCard
                      key={m.id}
                      monitor={m}
                      websiteId={id}
                      onDelete={() => deleteMutation.mutate(m.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {showAdd && (
        <AddMonitorModal
          websiteId={id}
          domain={website?.domain}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
