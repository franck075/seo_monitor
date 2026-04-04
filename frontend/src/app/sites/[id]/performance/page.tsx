"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Plus, Trash2, RefreshCw, Bell, Monitor, Smartphone, AlertTriangle,
  CheckCircle, XCircle, Clock, Zap, X, Check, Globe, Layers,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Rating = "good" | "needs-improvement" | "poor";

type VitalsData = {
  performance_score?: number;
  lcp?: number; lcp_rating?: Rating;
  cls?: number; cls_rating?: Rating;
  inp?: number; inp_rating?: Rating;
  ttfb?: number; ttfb_rating?: Rating;
  fcp?: number;
  recorded_at?: string;
};

type MonitoredPage = {
  id: number;
  url: string;
  label: string;
  is_active: boolean;
  created_at: string;
  vitals: { mobile?: VitalsData; desktop?: VitalsData };
};

type HistoryPoint = {
  recorded_at: string;
  performance_score?: number;
  lcp?: number; cls?: number; inp?: number; ttfb?: number;
  lcp_rating?: Rating; cls_rating?: Rating; inp_rating?: Rating;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const RATING_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ElementType }> = {
  good: { color: "text-green-700", bg: "bg-green-100", label: "Bon", icon: CheckCircle },
  "needs-improvement": { color: "text-yellow-700", bg: "bg-yellow-100", label: "À améliorer", icon: AlertTriangle },
  poor: { color: "text-red-700", bg: "bg-red-100", label: "Mauvais", icon: XCircle },
};

function RatingBadge({ rating }: { rating?: string }) {
  if (!rating) return <span className="text-gray-300 text-xs">—</span>;
  const cfg = RATING_CONFIG[rating] ?? RATING_CONFIG["poor"];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function ScoreRing({ score }: { score?: number }) {
  if (score == null) return (
    <div className="w-16 h-16 rounded-full border-4 border-gray-200 flex items-center justify-center">
      <span className="text-gray-300 text-sm font-bold">—</span>
    </div>
  );
  const color = score >= 90 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  const r = 24, circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg width="64" height="64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="absolute text-sm font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

function MetricRow({ label, value, unit, rating }: {
  label: string; value?: number; unit: string; rating?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 font-medium w-10">{label}</span>
      <span className="text-sm font-mono text-gray-800">
        {value != null ? `${value.toFixed(unit === "s" ? 2 : unit === "ms" ? 0 : 3)}${unit}` : "—"}
      </span>
      <RatingBadge rating={rating} />
    </div>
  );
}

// ── Page card ─────────────────────────────────────────────────────────────────
function PageCard({
  page, websiteId, onDelete, onScan, onSelect, isSelected,
}: {
  page: MonitoredPage; websiteId: string;
  onDelete: () => void; onScan: () => void;
  onSelect: () => void; isSelected: boolean;
}) {
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const vitals = page.vitals[strategy];
  const qc = useQueryClient();

  const scanMutation = useMutation({
    mutationFn: async () => api.post(`/websites/${websiteId}/vitals/pages/${page.id}/scan`),
    onSuccess: () => { setTimeout(() => qc.invalidateQueries({ queryKey: ["vitals-pages", websiteId] }), 8000); onScan(); },
  });

  const overallRating = vitals ? (
    [vitals.lcp_rating, vitals.cls_rating, vitals.inp_rating].includes("poor") ? "poor"
    : [vitals.lcp_rating, vitals.cls_rating, vitals.inp_rating].includes("needs-improvement") ? "needs-improvement"
    : vitals.performance_score != null ? (vitals.performance_score >= 90 ? "good" : vitals.performance_score >= 50 ? "needs-improvement" : "poor")
    : undefined
  ) : undefined;

  const borderColor = overallRating === "good" ? "border-green-200" : overallRating === "poor" ? "border-red-200" : overallRating === "needs-improvement" ? "border-yellow-200" : "border-gray-200";

  return (
    <div className={`bg-white rounded-xl border-2 ${borderColor} p-5 transition-shadow hover:shadow-md ${isSelected ? "ring-2 ring-blue-400" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
          <p className="font-semibold text-gray-900 truncate" title={page.label}>{page.label}</p>
          <p className="text-xs text-gray-400 truncate mt-0.5" title={page.url}>
            {page.url.replace(/^https?:\/\//, "")}
          </p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}
            title="Scanner maintenant"
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <RefreshCw className={`w-4 h-4 ${scanMutation.isPending ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onDelete} title="Supprimer"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Strategy toggle */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-4">
        <button onClick={() => setStrategy("mobile")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded-md transition-colors ${strategy === "mobile" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
          <Smartphone className="w-3 h-3" /> Mobile
        </button>
        <button onClick={() => setStrategy("desktop")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded-md transition-colors ${strategy === "desktop" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
          <Monitor className="w-3 h-3" /> Desktop
        </button>
      </div>

      {!vitals ? (
        <div className="py-6 text-center text-gray-300">
          <RefreshCw className="w-8 h-8 mx-auto mb-2" />
          <p className="text-xs">Scan en cours…</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <ScoreRing score={vitals.performance_score} />
            <div className="text-right">
              <p className="text-xs text-gray-400">Score Perf.</p>
              {vitals.recorded_at && (
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(vitals.recorded_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-0">
            <MetricRow label="LCP" value={vitals.lcp != null ? vitals.lcp / 1000 : undefined} unit="s" rating={vitals.lcp_rating} />
            <MetricRow label="CLS" value={vitals.cls} unit="" rating={vitals.cls_rating} />
            <MetricRow label="INP" value={vitals.inp} unit="ms" rating={vitals.inp_rating} />
            <MetricRow label="TTFB" value={vitals.ttfb} unit="ms" rating={vitals.ttfb_rating} />
          </div>
        </>
      )}

      <button onClick={onSelect}
        className="mt-4 w-full text-xs text-blue-600 hover:text-blue-800 text-center py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
        {isSelected ? "Masquer l'historique" : "Voir l'historique →"}
      </button>
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ websiteId, pageUrl }: { websiteId: string; pageUrl: string }) {
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [histMetric, setHistMetric] = useState<"performance_score" | "lcp" | "cls" | "inp">("performance_score");

  const { data: history = [] } = useQuery<HistoryPoint[]>({
    queryKey: ["vitals-history", websiteId, pageUrl, strategy],
    queryFn: async () => (await api.get(`/websites/${websiteId}/vitals/history?page_url=${encodeURIComponent(pageUrl)}&strategy=${strategy}&limit=30`)).data,
  });

  const chartData = history.map((h) => ({
    date: new Date(h.recorded_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    performance_score: h.performance_score,
    lcp: h.lcp != null ? +(h.lcp / 1000).toFixed(2) : null,
    cls: h.cls != null ? +h.cls.toFixed(4) : null,
    inp: h.inp,
  }));

  const METRICS = [
    { key: "performance_score" as const, label: "Score", color: "#3b82f6" },
    { key: "lcp" as const, label: "LCP (s)", color: "#8b5cf6" },
    { key: "cls" as const, label: "CLS", color: "#f59e0b" },
    { key: "inp" as const, label: "INP (ms)", color: "#ef4444" },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Historique des performances</h3>
          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">{pageUrl}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(["mobile", "desktop"] as const).map((s) => (
              <button key={s} onClick={() => setStrategy(s)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${strategy === s ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {s === "mobile" ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                {s === "mobile" ? "Mobile" : "Desktop"}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {METRICS.map((m) => (
              <button key={m.key} onClick={() => setHistMetric(m.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${histMetric === m.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {chartData.length < 2 ? (
        <div className="h-48 flex items-center justify-center text-gray-300 text-sm">
          Pas assez de données — relancez des scans pour voir l'évolution
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey={histMetric}
              stroke={METRICS.find((m) => m.key === histMetric)?.color ?? "#3b82f6"}
              strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Raw table */}
      {history.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-center">Score</th>
                <th className="px-3 py-2 text-center">LCP</th>
                <th className="px-3 py-2 text-center">CLS</th>
                <th className="px-3 py-2 text-center">INP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...history].reverse().slice(0, 10).map((h, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-600">
                    {new Date(h.recorded_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-3 py-1.5 text-center font-bold" style={{
                    color: h.performance_score == null ? "#9ca3af" : h.performance_score >= 90 ? "#16a34a" : h.performance_score >= 50 ? "#ca8a04" : "#dc2626"
                  }}>
                    {h.performance_score ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      {h.lcp != null ? <span>{(h.lcp / 1000).toFixed(2)}s</span> : "—"}
                      <RatingBadge rating={h.lcp_rating} />
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      {h.cls != null ? <span>{h.cls.toFixed(3)}</span> : "—"}
                      <RatingBadge rating={h.cls_rating} />
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      {h.inp != null ? <span>{h.inp.toFixed(0)}ms</span> : "—"}
                      <RatingBadge rating={h.inp_rating} />
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

// ── Alert panel ───────────────────────────────────────────────────────────────
function VitalsAlertPanel({ websiteId }: { websiteId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [channels, setChannels] = useState<string[]>(["email", "telegram"]);

  const { data: rules = [] } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: async () => (await api.get("/alerts/rules")).data,
  });

  const vitalsRules = (rules as { id: number; metric: string; is_active: boolean; name: string; channels: string[] }[])
    .filter((r) => r.metric === "vitals_degradation");

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/alerts/rules", {
        website_id: Number(websiteId),
        name: "Dégradation Core Web Vitals",
        metric: "vitals_degradation",
        condition: "gt",
        threshold: null,
        channels,
        cooldown_minutes: 720,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alert-rules"] }); setShowForm(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/alerts/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/alerts/rules/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-blue-600" />
          <h2 className="font-semibold text-gray-900">Alertes CWV</h2>
        </div>
        {vitalsRules.length === 0 && (
          <button onClick={() => setShowForm(!showForm)}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + Activer
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 p-4 bg-gray-50 rounded-xl space-y-3">
          <p className="text-xs text-gray-600">Recevez une alerte dès qu'un indicateur (LCP, CLS, INP) passe en <span className="font-semibold text-red-600">Mauvais</span>.</p>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Canaux</label>
            <div className="flex gap-2">
              {["email", "telegram"].map((ch) => (
                <button key={ch} onClick={() =>
                  setChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch])
                }
                  className={`px-4 py-1.5 rounded-lg border text-sm font-medium ${channels.includes(ch) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>
                  {ch === "email" ? "📧 Email" : "✈️ Telegram"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Annuler</button>
            <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || channels.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              <Check className="w-3.5 h-3.5" /> Créer
            </button>
          </div>
        </div>
      )}

      {vitalsRules.length === 0 && !showForm ? (
        <div className="py-6 text-center text-gray-300">
          <Bell className="w-8 h-8 mx-auto mb-2" />
          <p className="text-xs">Aucune alerte CWV activée</p>
        </div>
      ) : (
        <div className="space-y-2">
          {vitalsRules.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-gray-800">{r.name}</span>
                <span className="text-xs text-gray-400">{r.channels.map((c: string) => c === "email" ? "📧" : "✈️").join(" ")}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleMutation.mutate({ id: r.id, is_active: !r.is_active })}
                  className={`w-9 h-5 rounded-full relative transition-colors ${r.is_active ? "bg-blue-600" : "bg-gray-200"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${r.is_active ? "translate-x-4" : ""}`} />
                </button>
                <button onClick={() => deleteMutation.mutate(r.id)} className="text-gray-300 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Thresholds reference */}
      <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Seuils Google</p>
        {[
          { metric: "LCP", good: "< 2.5s", ok: "2.5–4s", poor: "> 4s" },
          { metric: "CLS", good: "< 0.1", ok: "0.1–0.25", poor: "> 0.25" },
          { metric: "INP", good: "< 200ms", ok: "200–500ms", poor: "> 500ms" },
          { metric: "TTFB", good: "< 800ms", ok: "800–1800ms", poor: "> 1800ms" },
        ].map(({ metric, good, ok, poor }) => (
          <div key={metric} className="flex items-center gap-2 text-xs">
            <span className="font-bold text-gray-700 w-10">{metric}</span>
            <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{good}</span>
            <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">{ok}</span>
            <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{poor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Add page modal ─────────────────────────────────────────────────────────────
function AddPageModal({ websiteId, domain, onClose }: { websiteId: string; domain?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState(`https://${domain ?? ""}`);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  const PRESETS = [
    { label: "Page d'accueil", suffix: "" },
    { label: "Blog", suffix: "/blog" },
    { label: "Contact", suffix: "/contact" },
    { label: "À propos", suffix: "/about" },
  ];

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post(`/websites/${websiteId}/vitals/pages`, { url: url.trim(), label: label.trim() || undefined });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vitals-pages", websiteId] }); onClose(); },
    onError: (e: { response?: { data?: { detail?: string } } }) => setError(e?.response?.data?.detail ?? "Erreur"),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Ajouter une page à surveiller</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Presets */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Pages courantes</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.suffix} onClick={() => {
                  const base = `https://${domain ?? ""}`;
                  setUrl(base + p.suffix);
                  setLabel(p.label);
                }}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-600 text-xs rounded-lg border border-gray-200 transition-colors">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">URL de la page *</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/ma-page"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nom (optionnel)</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Page d'accueil, Landing produit…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <strong>Données collectées via :</strong> PageSpeed Insights (Lighthouse) + Chrome UX Report.<br />
            LCP, INP, CLS, TTFB mesurés sur données d'utilisateurs réels (CrUX) et données de laboratoire.
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg border border-gray-200">Annuler</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !url.startsWith("http")}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Plus className="w-4 h-4" />
            {mutation.isPending ? "Ajout + scan…" : "Ajouter et scanner"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sitemap pages table ────────────────────────────────────────────────────────
function SitemapPagesPanel({ websiteId }: { websiteId: string }) {
  const qc = useQueryClient();
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ triggered: number } | null>(null);
  const [filter, setFilter] = useState<"all" | "poor" | "unscanned">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["sitemap-vitals", websiteId, strategy],
    queryFn: async () => (await api.get(`/websites/${websiteId}/vitals/sitemap-pages?strategy=${strategy}`)).data,
    staleTime: 5 * 60 * 1000,
  });

  const pages: Array<{
    url: string; scanned: boolean; performance_score?: number;
    lcp?: number; cls?: number; inp?: number; ttfb?: number;
    lcp_rating?: string; cls_rating?: string; inp_rating?: string; recorded_at?: string;
  }> = data?.pages ?? [];

  const filtered = pages.filter((p) => {
    if (filter === "poor") return p.scanned && [p.lcp_rating, p.cls_rating, p.inp_rating].includes("poor");
    if (filter === "unscanned") return !p.scanned;
    return true;
  });

  const poorCount = pages.filter((p) => p.scanned && [p.lcp_rating, p.cls_rating, p.inp_rating].includes("poor")).length;
  const unscannedCount = pages.filter((p) => !p.scanned).length;

  async function launchScan() {
    setScanning(true);
    try {
      const res = await api.post(`/websites/${websiteId}/vitals/scan-all-sitemap`);
      setScanResult(res.data);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["sitemap-vitals", websiteId] }), 30000);
    } finally {
      setScanning(false);
    }
  }

  function scoreColor(s?: number) {
    if (s == null) return "#9ca3af";
    return s >= 90 ? "#16a34a" : s >= 50 ? "#ca8a04" : "#dc2626";
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(["mobile", "desktop"] as const).map((s) => (
              <button key={s} onClick={() => setStrategy(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${strategy === s ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {s === "mobile" ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                {s === "mobile" ? "Mobile" : "Desktop"}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {[
              { key: "all", label: `Toutes (${pages.length})` },
              { key: "poor", label: `Critiques (${poorCount})` },
              { key: "unscanned", label: `Non scannées (${unscannedCount})` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key as typeof filter)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filter === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={launchScan} disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60">
          <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scan en cours…" : "Scanner toutes les pages"}
        </button>
      </div>

      {scanResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          {scanResult.triggered} scans lancés en arrière-plan — les résultats apparaîtront progressivement (~30s par page)
        </div>
      )}

      {/* Stats rapides */}
      {data?.has_sitemap && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{data.total}</p>
            <p className="text-xs text-gray-500">Pages dans le sitemap</p>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{data.scanned}</p>
            <p className="text-xs text-gray-500">Scannées</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{poorCount}</p>
            <p className="text-xs text-gray-500">Critiques</p>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex justify-center">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data?.has_sitemap ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          Aucun sitemap disponible — configurez votre sitemap dans la section Sitemaps
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left">Page</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3 text-center">LCP</th>
                  <th className="px-4 py-3 text-center">CLS</th>
                  <th className="px-4 py-3 text-center">INP</th>
                  <th className="px-4 py-3 text-center">TTFB</th>
                  <th className="px-4 py-3 text-center">Dernière analyse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => {
                  const isCritical = p.scanned && [p.lcp_rating, p.cls_rating, p.inp_rating].includes("poor");
                  return (
                    <tr key={p.url} className={`hover:bg-gray-50 ${isCritical ? "bg-red-50/30" : ""}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700 max-w-xs">
                        <span className="truncate block" title={p.url}>
                          {p.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {p.scanned ? (
                          <span className="font-bold text-sm" style={{ color: scoreColor(p.performance_score) }}>
                            {p.performance_score ?? "—"}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 italic">Non scanné</span>
                        )}
                      </td>
                      {(["lcp", "cls", "inp", "ttfb"] as const).map((metric) => (
                        <td key={metric} className="px-4 py-2.5 text-center">
                          {p.scanned ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-xs text-gray-700 font-mono">
                                {metric === "lcp" && p.lcp != null ? `${(p.lcp / 1000).toFixed(2)}s`
                                  : metric === "cls" && p.cls != null ? p.cls.toFixed(3)
                                  : metric === "inp" && p.inp != null ? `${Math.round(p.inp)}ms`
                                  : metric === "ttfb" && p.ttfb != null ? `${Math.round(p.ttfb)}ms`
                                  : "—"}
                              </span>
                              <RatingBadge rating={p[`${metric}_rating` as keyof typeof p] as string | undefined} />
                            </div>
                          ) : <span className="text-gray-200">—</span>}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-center text-xs text-gray-400">
                        {p.recorded_at ? new Date(p.recorded_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VitalsPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const qc = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [scanningMsg, setScanningMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"monitored" | "sitemap">("sitemap");

  const { data: pages = [], isLoading } = useQuery<MonitoredPage[]>({
    queryKey: ["vitals-pages", id],
    queryFn: async () => (await api.get(`/websites/${id}/vitals/pages`)).data,
    refetchInterval: 15000,
  });

  const { data: website } = useQuery({
    queryKey: ["website", id],
    queryFn: async () => (await api.get(`/websites/${id}`)).data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (pageId: number) => api.delete(`/websites/${id}/vitals/pages/${pageId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vitals-pages", id] }),
  });

  // Overall stats
  const allVitals = pages.flatMap((p) => [p.vitals.mobile, p.vitals.desktop].filter(Boolean) as VitalsData[]);
  const poorCount = allVitals.filter((v) => [v.lcp_rating, v.cls_rating, v.inp_rating].includes("poor")).length;
  const goodCount = allVitals.filter((v) => ![v.lcp_rating, v.cls_rating, v.inp_rating].includes("poor") && ![v.lcp_rating, v.cls_rating, v.inp_rating].includes("needs-improvement")).length;
  const avgScore = allVitals.length > 0
    ? Math.round(allVitals.filter((v) => v.performance_score != null).reduce((a, v) => a + (v.performance_score ?? 0), 0) / allVitals.filter((v) => v.performance_score != null).length)
    : null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopNav title="Core Web Vitals" />
        <main className="p-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <Link href={`/websites/${id}`} className="text-sm text-blue-600 hover:underline">← Retour au site</Link>
            {activeTab === "monitored" && (
              <button onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
                <Plus className="w-4 h-4" /> Ajouter une page
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            <button onClick={() => setActiveTab("sitemap")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === "sitemap" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Globe className="w-4 h-4" /> Toutes les pages indexées
            </button>
            <button onClick={() => setActiveTab("monitored")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === "monitored" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Layers className="w-4 h-4" /> Pages surveillées
            </button>
          </div>

          {/* Sitemap tab */}
          {activeTab === "sitemap" && <SitemapPagesPanel websiteId={id} />}

          {/* Monitored tab */}
          {activeTab === "monitored" && <>
          {scanningMsg && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> {scanningMsg}
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 h-64 animate-pulse" />)}
            </div>
          ) : pages.length === 0 ? (
            /* ── Empty state onboarding ── */
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center max-w-2xl mx-auto">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Surveillez vos Core Web Vitals</h2>
              <p className="text-gray-500 text-sm mb-6">
                Ajoutez vos pages importantes (accueil, landing pages, pages produits) pour mesurer
                LCP, INP, CLS et TTFB via PageSpeed Insights et Chrome UX Report.
              </p>
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { icon: "📊", title: "Données réelles", desc: "Mesures basées sur les utilisateurs réels (CrUX)" },
                  { icon: "🔔", title: "Alertes instantanées", desc: "Notification email & Telegram en cas de dégradation" },
                  { icon: "📈", title: "Historique", desc: "Suivez l'évolution dans le temps" },
                ].map((f) => (
                  <div key={f.title} className="bg-gray-50 rounded-xl p-4 text-center">
                    <div className="text-2xl mb-2">{f.icon}</div>
                    <p className="text-xs font-semibold text-gray-800 mb-1">{f.title}</p>
                    <p className="text-xs text-gray-500">{f.desc}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 mx-auto">
                <Plus className="w-5 h-5" /> Ajouter ma première page
              </button>
            </div>
          ) : (
            <>
              {/* Summary row */}
              {allVitals.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg"><Monitor className="w-4 h-4 text-blue-600" /></div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{pages.length}</p>
                      <p className="text-xs text-gray-500">Pages suivies</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                    <div className="p-2 bg-gray-50 rounded-lg">
                      <span className="text-lg font-bold" style={{ color: avgScore == null ? "#9ca3af" : avgScore >= 90 ? "#16a34a" : avgScore >= 50 ? "#ca8a04" : "#dc2626" }}>
                        {avgScore ?? "—"}
                      </span>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{avgScore ?? "—"}</p>
                      <p className="text-xs text-gray-500">Score moyen</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-green-200 p-4 flex items-center gap-3">
                    <div className="p-2 bg-green-50 rounded-lg"><CheckCircle className="w-4 h-4 text-green-600" /></div>
                    <div>
                      <p className="text-2xl font-bold text-green-700">{goodCount}</p>
                      <p className="text-xs text-gray-500">Pages en bon état</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-red-200 p-4 flex items-center gap-3">
                    <div className="p-2 bg-red-50 rounded-lg"><XCircle className="w-4 h-4 text-red-500" /></div>
                    <div>
                      <p className="text-2xl font-bold text-red-600">{poorCount}</p>
                      <p className="text-xs text-gray-500">Pages critiques</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Page cards + alert panel */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {pages.map((page) => (
                      <PageCard
                        key={page.id}
                        page={page}
                        websiteId={id}
                        isSelected={selectedPage === page.url}
                        onSelect={() => setSelectedPage(selectedPage === page.url ? null : page.url)}
                        onDelete={() => deleteMutation.mutate(page.id)}
                        onScan={() => setScanningMsg(`Scan en cours pour ${page.label}… résultats dans ~30s`)}
                      />
                    ))}
                    {/* Add page shortcut card */}
                    <button onClick={() => setShowAddModal(true)}
                      className="bg-white rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 p-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-blue-600 transition-colors min-h-[200px]">
                      <Plus className="w-8 h-8" />
                      <span className="text-sm font-medium">Ajouter une page</span>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-1">
                  <VitalsAlertPanel websiteId={id} />
                </div>
              </div>

              {/* History panel */}
              {selectedPage && (
                <HistoryPanel websiteId={id} pageUrl={selectedPage} />
              )}
            </>
          )}
          </>}
        </main>
      </div>

      {showAddModal && (
        <AddPageModal
          websiteId={id}
          domain={website?.domain}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
