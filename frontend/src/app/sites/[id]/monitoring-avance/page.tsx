"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import {
  AlertTriangle, CheckCircle2, RefreshCw, Scan, ChevronDown, ChevronUp,
  ExternalLink, Settings, Bell, BellOff, FileText, X, Save,
  TrendingDown, GitBranch, Clock, Eye, Link2, Bot, Shield, FileX2, Layers,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Issue = {
  id: number; issue_type: string; severity: "high" | "medium" | "low";
  url: string | null; detail: string; data: Record<string, unknown>;
  detected_at: string; is_resolved: boolean; resolved_at: string | null;
};

type Summary = {
  total: number;
  by_type: Record<string, { count: number; high: number }>;
};

type AlertConfig = {
  issue_type: string; label: string; enabled: boolean;
  frequency: "daily" | "weekly" | "monthly"; threshold: number | null;
  channels: string[]; last_notified_at: string | null;
};

// ── Config visuelle par type ───────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, {
  label: string; icon: React.ElementType; color: string; bg: string; border: string;
  description: string; category: string;
}> = {
  cannibalization:  { label: "Cannibalisation",         icon: Layers,       color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200",    description: "2+ pages en compétition pour le même mot-clé", category: "Contenu" },
  position_drop:   { label: "Chutes de positions",      icon: TrendingDown, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", description: "Pages ayant perdu ≥5 positions en 7 jours", category: "Performance" },
  redirect_chain:  { label: "Chaînes de redirections",  icon: GitBranch,    color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200", description: "Redirections > 2 sauts ou 301→302 mixte", category: "Technique" },
  aging_content:   { label: "Contenu vieillissant",     icon: Clock,        color: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-200",  description: "Pages dont le trafic décline mois après mois", category: "Contenu" },
  no_impressions:  { label: "Déindex silencieux",       icon: Eye,          color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200", description: "Pages sans impressions GSC depuis X jours", category: "Indexation" },
  canonical_change:{ label: "Canonique modifiée",       icon: Link2,        color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200",   description: "Balise canonique changée ou manquante", category: "Technique" },
  robots_change:   { label: "robots.txt modifié",       icon: Bot,          color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200",    description: "Le fichier robots.txt a changé", category: "Technique" },
  x_robots_noindex:{ label: "X-Robots noindex",         icon: Shield,       color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",    description: "En-tête HTTP X-Robots-Tag:noindex détecté", category: "Technique" },
  redirect_broken: { label: "Redirection cassée",       icon: AlertTriangle,color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200",    description: "www→non-www ou HTTP→HTTPS ne redirige plus", category: "Technique" },
  h1_change:       { label: "Changement H1",            icon: FileText,     color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200", description: "Balise H1 modifiée (dont H1→H2)", category: "Contenu" },
  duplicate_title: { label: "Titres en doublon",        icon: FileX2,       color: "text-pink-600",   bg: "bg-pink-50",   border: "border-pink-200",   description: "Même balise Title sur 2+ pages", category: "Contenu" },
  duplicate_meta:  { label: "Meta en doublon",          icon: FileX2,       color: "text-pink-600",   bg: "bg-pink-50",   border: "border-pink-200",   description: "Même Meta Description sur 2+ pages", category: "Contenu" },
};

const CATEGORIES = ["Technique", "Contenu", "Performance", "Indexation"];

const FREQ_LABELS: Record<string, string> = { daily: "Quotidien", weekly: "Hebdo", monthly: "Mensuel" };

// ── Composant section ─────────────────────────────────────────────────────────

function IssueSection({ issueType, issues, summary, onResolve, resolving }: {
  issueType: string; issues: Issue[];
  summary: { count: number; high: number };
  onResolve: (id: number) => void; resolving: number | null;
}) {
  const [open, setOpen] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const cfg = TYPE_CONFIG[issueType] ?? { label: issueType, icon: AlertTriangle, color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200", description: "", category: "" };
  const Icon = cfg.icon;
  const active = issues.filter((i) => !i.is_resolved);
  const resolved = issues.filter((i) => i.is_resolved);
  const count = summary.count;

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-4 hover:opacity-80 transition">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-xl shadow-sm">
            <Icon className={`w-4 h-4 ${cfg.color}`} />
          </div>
          <div className="text-left">
            <p className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</p>
            <p className="text-xs text-gray-500">{cfg.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {count === 0 ? (
            <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> OK
            </span>
          ) : (
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${summary.high > 0 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
              {count} {count > 1 ? "problèmes" : "problème"}
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-white/60 bg-white/70">
          {active.length === 0 && resolved.length === 0 && (
            <p className="px-5 py-4 text-sm text-gray-400 text-center">Aucun problème détecté — scan en attente.</p>
          )}
          {active.map((issue) => (
            <IssueRow key={issue.id} issue={issue} onResolve={onResolve} resolving={resolving} />
          ))}
          {resolved.length > 0 && (
            <div>
              <button onClick={() => setShowResolved((s) => !s)} className="px-5 py-2 text-xs text-gray-400 hover:text-gray-600 w-full text-left border-t border-gray-100">
                {showResolved ? "Masquer" : "Voir"} {resolved.length} problème(s) résolu(s)
              </button>
              {showResolved && resolved.map((issue) => (
                <IssueRow key={issue.id} issue={issue} onResolve={onResolve} resolving={resolving} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue, onResolve, resolving }: {
  issue: Issue; onResolve: (id: number) => void; resolving: number | null;
}) {
  const [showData, setShowData] = useState(false);
  return (
    <div className={`px-5 py-3.5 border-t border-gray-100 ${issue.is_resolved ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${issue.severity === "high" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
              {issue.severity === "high" ? "Critique" : "Moyen"}
            </span>
            {issue.is_resolved && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Résolu
              </span>
            )}
            <span className="text-xs text-gray-400">
              {new Date(issue.detected_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </span>
          </div>
          <p className="text-sm text-gray-800">{issue.detail}</p>
          {issue.url && (
            <a href={issue.url} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline mt-0.5">
              {issue.url.length > 60 ? issue.url.slice(0, 60) + "…" : issue.url}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {issue.data && Object.keys(issue.data).length > 0 && (
            <>
              <button onClick={() => setShowData((s) => !s)} className="mt-1 text-xs text-gray-400 hover:text-gray-600 underline">
                {showData ? "Masquer" : "Détails"}
              </button>
              {showData && (
                <pre className="mt-2 p-2.5 bg-gray-900 text-gray-100 text-xs rounded-lg overflow-x-auto max-w-full">
                  {JSON.stringify(issue.data, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
        {!issue.is_resolved && (
          <button onClick={() => onResolve(issue.id)} disabled={resolving === issue.id}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
            {resolving === issue.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
            Résolu
          </button>
        )}
      </div>
    </div>
  );
}

// ── Panel configuration alertes ───────────────────────────────────────────────

function AlertConfigPanel({ websiteId, onClose }: { websiteId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: configs = [] } = useQuery<AlertConfig[]>({
    queryKey: ["seo-alert-config", websiteId],
    queryFn: () => api.get(`/websites/${websiteId}/seo-issues/alert-config`).then((r) => r.data),
  });

  const [local, setLocal] = useState<AlertConfig[]>([]);
  const [initialized, setInitialized] = useState(false);
  if (!initialized && configs.length > 0) { setLocal(configs); setInitialized(true); }

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/websites/${websiteId}/seo-issues/alert-config`, local),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["seo-alert-config", websiteId] }); onClose(); },
  });

  const update = (index: number, field: keyof AlertConfig, value: unknown) => {
    setLocal((prev) => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const display = local.length > 0 ? local : configs;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-gray-900">Configuration des alertes</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          <p className="text-sm text-gray-500 mb-4">
            Configurez la fréquence et le seuil de notification pour chaque type de problème SEO détecté.
          </p>
          <div className="space-y-2">
            {display.map((cfg, i) => {
              const tcfg = TYPE_CONFIG[cfg.issue_type];
              const Icon = tcfg?.icon ?? Bell;
              return (
                <div key={cfg.issue_type} className={`flex items-center gap-3 p-3 rounded-xl border ${cfg.enabled ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"}`}>
                  <div className={`p-1.5 rounded-lg ${tcfg?.bg || "bg-gray-100"}`}>
                    <Icon className={`w-4 h-4 ${tcfg?.color || "text-gray-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{cfg.label}</p>
                  </div>
                  {/* Seuil (pour position_drop et no_impressions) */}
                  {(cfg.issue_type === "position_drop" || cfg.issue_type === "no_impressions") && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">Seuil</span>
                      <input
                        type="number" min={1} max={100}
                        value={cfg.threshold ?? (cfg.issue_type === "position_drop" ? 5 : 30)}
                        onChange={(e) => update(i, "threshold", parseInt(e.target.value) || null)}
                        className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:border-indigo-300"
                      />
                      <span className="text-xs text-gray-400">{cfg.issue_type === "position_drop" ? "pos." : "j."}</span>
                    </div>
                  )}
                  {/* Fréquence */}
                  <select
                    value={cfg.frequency}
                    onChange={(e) => update(i, "frequency", e.target.value)}
                    disabled={!cfg.enabled}
                    className="px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-300 bg-white"
                  >
                    <option value="daily">Quotidien</option>
                    <option value="weekly">Hebdo</option>
                    <option value="monthly">Mensuel</option>
                  </select>
                  {/* Toggle activé */}
                  <button
                    onClick={() => update(i, "enabled", !cfg.enabled)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition ${cfg.enabled ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"}`}
                  >
                    {cfg.enabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                    {cfg.enabled ? "On" : "Off"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuler</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rapport mensuel ────────────────────────────────────────────────────────────

function MonthlyReportModal({ websiteId, onClose }: { websiteId: number; onClose: () => void }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const { data: report, isLoading } = useQuery({
    queryKey: ["monthly-report", websiteId, year, month],
    queryFn: () => api.get(`/websites/${websiteId}/seo-issues/monthly-report?year=${year}&month=${month}`).then((r) => r.data),
    staleTime: 300_000,
  });

  const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

  const delta = (curr: number | null, prev: number | null) => {
    if (curr == null || prev == null || prev === 0) return null;
    const pct = ((curr - prev) / prev) * 100;
    return { pct: Math.round(pct), up: pct > 0 };
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-gray-900">Rapport mensuel</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Sélecteur mois/année */}
        <div className="px-6 py-3 bg-gray-50 border-b flex items-center gap-3">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="px-3 py-1.5 border rounded-lg text-sm">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="px-3 py-1.5 border rounded-lg text-sm">
            {[today.getFullYear(), today.getFullYear() - 1].map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {isLoading ? (
            <div className="space-y-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : report ? (
            <div className="space-y-5">
              {/* GSC */}
              {report.gsc && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2"><Eye className="w-4 h-4" /> Google Search Console</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Clics", val: report.gsc.clicks, prev: report.gsc.prev_clicks },
                      { label: "Impressions", val: report.gsc.impressions, prev: report.gsc.prev_impressions },
                      { label: "CTR moy.", val: report.gsc.avg_ctr ? `${Number(report.gsc.avg_ctr).toFixed(1)}%` : "—" },
                      { label: "Position moy.", val: report.gsc.avg_position ? `#${report.gsc.avg_position.toFixed(1)}` : "—" },
                    ].map(({ label, val, prev }) => {
                      const d = typeof val === "number" && prev != null ? delta(val as number, prev) : null;
                      return (
                        <div key={label} className="bg-white rounded-lg p-3">
                          <p className="text-xs text-gray-500">{label}</p>
                          <p className="text-lg font-bold text-gray-900">{val?.toLocaleString?.() ?? val ?? "—"}</p>
                          {d && <p className={`text-xs font-medium ${d.up ? "text-green-600" : "text-red-500"}`}>{d.up ? "+" : ""}{d.pct}% vs mois préc.</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* GA4 */}
              {report.ga4 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2"><TrendingDown className="w-4 h-4" /> Google Analytics 4</h3>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {[
                      { label: "Sessions", val: report.ga4.sessions, prev: report.ga4.prev_sessions },
                      { label: "Utilisateurs", val: report.ga4.users },
                      { label: "Pages vues", val: report.ga4.pageviews },
                    ].map(({ label, val, prev }) => {
                      const d = typeof val === "number" && prev != null ? delta(val as number, prev as number) : null;
                      return (
                        <div key={label} className="bg-white rounded-lg p-3">
                          <p className="text-xs text-gray-500">{label}</p>
                          <p className="text-lg font-bold text-gray-900">{val?.toLocaleString?.() ?? "—"}</p>
                          {d && <p className={`text-xs font-medium ${d.up ? "text-green-600" : "text-red-500"}`}>{d.up ? "+" : ""}{d.pct}% vs mois préc.</p>}
                        </div>
                      );
                    })}
                  </div>
                  {report.ga4.top_pages?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-green-700 mb-1">Top pages organiques</p>
                      {report.ga4.top_pages.slice(0, 5).map((p: { page: string; sessions: number }) => (
                        <div key={p.page} className="flex justify-between text-xs py-1 border-t border-green-100">
                          <span className="text-gray-600 truncate max-w-xs">{p.page}</span>
                          <span className="font-medium text-green-700 shrink-0">{p.sessions} sess.</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Mots-clés */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <h3 className="font-semibold text-indigo-800 mb-3">Mots-clés ce mois</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-green-600">{report.keywords?.improved ?? 0}</p>
                    <p className="text-xs text-gray-500">En hausse</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-red-500">{report.keywords?.declined ?? 0}</p>
                    <p className="text-xs text-gray-500">En baisse</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-gray-700">{report.keywords?.total ?? 0}</p>
                    <p className="text-xs text-gray-500">Total suivis</p>
                  </div>
                </div>
              </div>

              {/* Vitals */}
              {report.vitals && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">Core Web Vitals (mobile)</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className={`text-xl font-bold ${(report.vitals.avg_score ?? 0) >= 75 ? "text-green-600" : (report.vitals.avg_score ?? 0) >= 50 ? "text-yellow-500" : "text-red-500"}`}>
                        {report.vitals.avg_score ?? "—"}
                      </p>
                      <p className="text-xs text-gray-500">Score moyen</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-gray-700">{report.vitals.avg_lcp_s ?? "—"}s</p>
                      <p className="text-xs text-gray-500">LCP moyen</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-gray-700">{report.vitals.pages_scanned}</p>
                      <p className="text-xs text-gray-500">Pages scannées</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Issues */}
              {Object.keys(report.issues ?? {}).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <h3 className="font-semibold text-red-800 mb-3">Problèmes détectés ce mois ({report.issues_total})</h3>
                  <div className="space-y-1.5">
                    {Object.entries(report.issues as Record<string, { total: number; high: number; resolved: number }>).map(([type, counts]) => {
                      const tcfg = TYPE_CONFIG[type];
                      return (
                        <div key={type} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">{tcfg?.label ?? type}</span>
                          <div className="flex items-center gap-2">
                            {counts.high > 0 && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">{counts.high} critiques</span>}
                            {counts.resolved > 0 && <span className="text-green-600 text-xs">{counts.resolved} résolus</span>}
                            <span className="font-semibold text-gray-800">{counts.total}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-gray-400 py-8">Aucune donnée disponible pour cette période.</p>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-800 text-white rounded-xl hover:bg-gray-900">Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function SEOIssuesPage() {
  const { id } = useParams<{ id: string }>();
  const websiteId = parseInt(id);
  const qc = useQueryClient();
  const [resolving, setResolving] = useState<number | null>(null);
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("Tous");

  const { data: summary } = useQuery<Summary>({
    queryKey: ["seo-issues-summary", websiteId],
    queryFn: () => api.get(`/websites/${websiteId}/seo-issues/summary`).then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: issues = [], isLoading } = useQuery<Issue[]>({
    queryKey: ["seo-issues", websiteId],
    queryFn: () => api.get(`/websites/${websiteId}/seo-issues`).then((r) => r.data),
    staleTime: 60_000,
  });

  const scanMutation = useMutation({
    mutationFn: () => api.post(`/websites/${websiteId}/seo-issues/scan`),
    onSuccess: () => setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["seo-issues", websiteId] });
      qc.invalidateQueries({ queryKey: ["seo-issues-summary", websiteId] });
    }, 8000),
  });

  const resolveMutation = useMutation({
    mutationFn: (issueId: number) => api.patch(`/websites/${websiteId}/seo-issues/${issueId}/resolve`),
    onMutate: (id) => setResolving(id),
    onSettled: () => { setResolving(null); qc.invalidateQueries({ queryKey: ["seo-issues", websiteId] }); qc.invalidateQueries({ queryKey: ["seo-issues-summary", websiteId] }); },
  });

  const byType = (type: string) => issues.filter((i) => i.issue_type === type);
  const typesByCategory = (cat: string) =>
    Object.entries(TYPE_CONFIG)
      .filter(([, c]) => c.category === cat)
      .map(([t]) => t);

  const allTypes = Object.keys(TYPE_CONFIG);
  const filteredTypes = activeCategory === "Tous" ? allTypes : typesByCategory(activeCategory);
  const totalActive = summary?.total ?? 0;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNav title="Monitoring SEO Avancé" />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Monitoring SEO Avancé</h1>
              <p className="text-sm text-gray-500 mt-1">12 cas détectés automatiquement avec alertes configurables</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowReport(true)}
                      className="flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
                <FileText className="w-4 h-4" /> Rapport mensuel
              </button>
              <button onClick={() => setShowAlertConfig(true)}
                      className="flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
                <Settings className="w-4 h-4" /> Alertes
              </button>
              <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 shadow-sm">
                {scanMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
                Lancer un scan
              </button>
            </div>
          </div>

          {/* KPI global */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
            <div className={`col-span-3 sm:col-span-1 rounded-2xl border p-4 shadow-sm ${totalActive > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
              <p className={`text-3xl font-bold ${totalActive > 0 ? "text-red-600" : "text-green-600"}`}>{totalActive}</p>
              <p className="text-xs text-gray-500 mt-0.5">Problèmes actifs</p>
            </div>
            {CATEGORIES.map((cat) => {
              const types = typesByCategory(cat);
              const count = types.reduce((acc, t) => acc + (summary?.by_type[t]?.count ?? 0), 0);
              return (
                <div key={cat} className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm cursor-pointer hover:border-indigo-300 transition ${activeCategory === cat ? "border-indigo-400 ring-1 ring-indigo-300" : ""}`}
                     onClick={() => setActiveCategory(activeCategory === cat ? "Tous" : cat)}>
                  <p className={`text-2xl font-bold ${count > 0 ? "text-red-500" : "text-gray-700"}`}>{count}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{cat}</p>
                </div>
              );
            })}
          </div>

          {/* Filtre catégories */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {["Tous", ...CATEGORIES].map((cat) => (
              <button key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition ${activeCategory === cat ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-indigo-300"}`}>
                {cat}
              </button>
            ))}
          </div>

          {scanMutation.isSuccess && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-5 text-sm text-blue-700">
              <RefreshCw className="w-4 h-4 animate-spin" /> Scan en cours — résultats dans quelques secondes...
            </div>
          )}

          {/* Sections par type */}
          {isLoading ? (
            <div className="space-y-3">{[0,1,2,3,4].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
          ) : (
            <div className="space-y-3">
              {filteredTypes.map((type) => (
                <IssueSection
                  key={type}
                  issueType={type}
                  issues={byType(type)}
                  summary={summary?.by_type[type] ?? { count: 0, high: 0 }}
                  onResolve={(id) => resolveMutation.mutate(id)}
                  resolving={resolving}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {showAlertConfig && <AlertConfigPanel websiteId={websiteId} onClose={() => setShowAlertConfig(false)} />}
      {showReport && <MonthlyReportModal websiteId={websiteId} onClose={() => setShowReport(false)} />}
    </div>
  );
}
