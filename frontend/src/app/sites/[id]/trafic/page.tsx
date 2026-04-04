"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import Link from "next/link";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, MousePointerClick, Eye,
  Clock, Bell, Check, X, AlertTriangle, Zap, FileSearch,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}
function fmtDuration(s: number | null | undefined) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

const PERIOD_OPTIONS = [
  { value: 7,  label: "7 jours" },
  { value: 30, label: "30 jours" },
  { value: 90, label: "90 jours" },
];

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, change, icon: Icon, color,
}: {
  label: string; value: string; sub?: string;
  change?: number | null; icon: React.ElementType; color: string;
}) {
  const changeColor = change == null ? "" : change > 0 ? "text-green-600" : "text-red-500";
  const ChangeIcon = change == null ? null : change > 0 ? TrendingUp : TrendingDown;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg bg-gray-50 ${color}`}><Icon className="w-4 h-4" /></div>
        {change != null && (
          <span className={`flex items-center gap-1 text-xs font-semibold ${changeColor}`}>
            {ChangeIcon && <ChangeIcon className="w-3 h-3" />}
            {change > 0 ? "+" : ""}{change}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Alert config panel ────────────────────────────────────────────────────────
function AlertPanel({ websiteId }: { websiteId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [metric, setMetric] = useState<"traffic_drop" | "traffic_spike">("traffic_drop");
  const [threshold, setThreshold] = useState("30");
  const [channels, setChannels] = useState<string[]>(["email", "telegram"]);

  const { data: rules = [] } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: async () => (await api.get("/alerts/rules")).data,
  });

  const trafficRules = (rules as { id: number; metric: string; threshold: number; channels: string[]; is_active: boolean; name: string }[])
    .filter((r) => r.metric === "traffic_drop" || r.metric === "traffic_spike");

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/alerts/rules", {
        website_id: Number(websiteId),
        name: metric === "traffic_drop"
          ? `Baisse trafic -${threshold}%`
          : `Pic trafic +${threshold}%`,
        metric,
        condition: metric === "traffic_drop" ? "gt" : "gt",
        threshold: Number(threshold) / 100,
        channels,
        cooldown_minutes: 360,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alert-rules"] }); setShowForm(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await api.delete(`/alerts/rules/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await api.put(`/alerts/rules/${id}`, { is_active });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-blue-600" />
          <h2 className="font-semibold text-gray-900">Alertes trafic</h2>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Nouvelle alerte
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Type d'alerte</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMetric("traffic_drop")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${metric === "traffic_drop" ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
              >
                <TrendingDown className="w-4 h-4" /> Baisse de trafic
              </button>
              <button
                onClick={() => setMetric("traffic_spike")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${metric === "traffic_spike" ? "border-green-400 bg-green-50 text-green-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
              >
                <Zap className="w-4 h-4" /> Pic de trafic
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Seuil (% par rapport à la moyenne 7j)
            </label>
            <div className="flex gap-2">
              {["20", "30", "50"].map((v) => (
                <button key={v} onClick={() => setThreshold(v)}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${threshold === v ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold" : "border-gray-200 text-gray-500"}`}>
                  {metric === "traffic_drop" ? "-" : "+"}{v}%
                </button>
              ))}
              <input
                type="number" value={threshold} min={5} max={200}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center"
              />
            </div>
          </div>

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

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Annuler</button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || channels.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" /> Créer
            </button>
          </div>
        </div>
      )}

      {trafficRules.length === 0 && !showForm ? (
        <p className="text-sm text-gray-400 text-center py-4">Aucune alerte trafic configurée.</p>
      ) : (
        <div className="space-y-2">
          {trafficRules.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2">
                {r.metric === "traffic_drop"
                  ? <TrendingDown className="w-4 h-4 text-red-500" />
                  : <Zap className="w-4 h-4 text-green-500" />}
                <span className="text-sm font-medium text-gray-800">{r.name}</span>
                <span className="text-xs text-gray-400">
                  {r.channels.map((c: string) => c === "email" ? "📧" : "✈️").join(" ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleMutation.mutate({ id: r.id, is_active: !r.is_active })}
                  className={`w-9 h-5 rounded-full relative transition-colors ${r.is_active ? "bg-blue-600" : "bg-gray-200"}`}
                >
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
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type TrafficRow = {
  date: string; sessions: number; users: number; new_users: number;
  pageviews: number; bounce_rate: number | null; avg_session_duration: number | null;
};

export default function TrafficPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [period, setPeriod] = useState(30);
  const [metric, setMetric] = useState<"sessions" | "users" | "pageviews">("sessions");

  const { data: stats, isLoading } = useQuery({
    queryKey: ["traffic-live-stats", id, period],
    queryFn: async () => (await api.get(`/websites/${id}/traffic/live-stats?period=${period}`)).data,
    staleTime: 5 * 60 * 1000,
  });

  const { data: zeroPages, isLoading: zeroLoading } = useQuery({
    queryKey: ["zero-organic-pages", id, period],
    queryFn: async () => (await api.get(`/websites/${id}/traffic/zero-organic-pages?period=${period}`)).data,
    staleTime: 10 * 60 * 1000,
    enabled: !!stats?.has_data,
  });

  const rows: TrafficRow[] = stats?.trend ?? [];
  const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const tableRows = [...rows].sort((a, b) => b.date.localeCompare(a.date));

  const hasData = stats?.has_data && rows.length > 0;

  // compute avg for reference line
  const avgSessions = stats?.avg7_sessions ?? 0;

  const METRIC_CONFIG = {
    sessions: { label: "Sessions", color: "#3b82f6", fill: "#dbeafe" },
    users: { label: "Utilisateurs", color: "#8b5cf6", fill: "#ede9fe" },
    pageviews: { label: "Pages vues", color: "#10b981", fill: "#d1fae5" },
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopNav title="Trafic Organique" />
        <main className="p-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <Link href={`/websites/${id}`} className="text-sm text-blue-600 hover:underline">
              ← Retour au site
            </Link>
            <div className="flex items-center gap-2">
              {stats?.latest_date && (
                <span className="text-xs text-gray-400">Données au {fmtDate(stats.latest_date)}</span>
              )}
              <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
                {PERIOD_OPTIONS.map((o) => (
                  <button key={o.value} onClick={() => setPeriod(o.value)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${period === o.value ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-700"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />)}
            </div>
          ) : !hasData ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <AlertTriangle className="w-10 h-10 mx-auto text-orange-300 mb-3" />
              <p className="text-gray-600 font-medium">Aucune donnée de trafic disponible</p>
              <p className="text-sm text-gray-400 mt-1">Vérifiez votre configuration GA4</p>
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KpiCard
                  label={`Sessions (${period}j)`}
                  value={fmt(stats.current.sessions)}
                  sub={`Moy. ${fmt(Math.round(stats.current.sessions / stats.current.days))}/j`}
                  change={stats.changes.sessions}
                  icon={MousePointerClick}
                  color="text-blue-600"
                />
                <KpiCard
                  label={`Utilisateurs (${period}j)`}
                  value={fmt(stats.current.users)}
                  change={stats.changes.users}
                  icon={Users}
                  color="text-purple-600"
                />
                <KpiCard
                  label={`Pages vues (${period}j)`}
                  value={fmt(stats.current.pageviews)}
                  change={stats.changes.pageviews}
                  icon={Eye}
                  color="text-green-600"
                />
                <KpiCard
                  label="Taux de rebond moy."
                  value={`${stats.current.bounce_rate}%`}
                  change={stats.changes.bounce_rate ? -stats.changes.bounce_rate : null}
                  sub={`Durée moy. ${fmtDuration(stats.current.avg_duration)}`}
                  icon={Clock}
                  color="text-orange-500"
                />
              </div>

              {/* Best/worst day highlights */}
              {(stats.best_day || stats.worst_day) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {stats.best_day && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg"><TrendingUp className="w-5 h-5 text-green-600" /></div>
                      <div>
                        <p className="text-xs text-green-700 font-medium">Meilleur jour</p>
                        <p className="text-lg font-bold text-green-800">{fmt(stats.best_day.sessions)} sessions</p>
                        <p className="text-xs text-green-600">{fmtDate(stats.best_day.date)}</p>
                      </div>
                    </div>
                  )}
                  {stats.worst_day && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                      <div className="p-2 bg-red-100 rounded-lg"><TrendingDown className="w-5 h-5 text-red-500" /></div>
                      <div>
                        <p className="text-xs text-red-600 font-medium">Pire jour</p>
                        <p className="text-lg font-bold text-red-700">{fmt(stats.worst_day.sessions)} sessions</p>
                        <p className="text-xs text-red-500">{fmtDate(stats.worst_day.date)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Main chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-gray-900">Évolution du trafic organique</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Données Google Analytics 4 — Source : Recherche organique</p>
                  </div>
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                    {(Object.keys(METRIC_CONFIG) as Array<keyof typeof METRIC_CONFIG>).map((k) => (
                      <button key={k} onClick={() => setMetric(k)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${metric === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                        {METRIC_CONFIG[k].label}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={sortedRows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={METRIC_CONFIG[metric].color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={METRIC_CONFIG[metric].color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={fmtDate}
                      interval={Math.floor(sortedRows.length / 6)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      labelFormatter={(d) => fmtDate(d as string)}
                      formatter={(val: number) => [val.toLocaleString(), METRIC_CONFIG[metric].label]}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                    />
                    {avgSessions > 0 && metric === "sessions" && (
                      <ReferenceLine y={avgSessions} stroke="#f59e0b" strokeDasharray="4 4"
                        label={{ value: `Moy. 7j: ${fmt(avgSessions)}`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }} />
                    )}
                    <Area
                      type="monotone"
                      dataKey={metric}
                      stroke={METRIC_CONFIG[metric].color}
                      fill="url(#grad)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Sessions vs Users bar chart */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 mb-4">Sessions vs Utilisateurs</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={sortedRows.slice(-30)} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={fmtDate} interval={4} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={(d) => fmtDate(d as string)}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <Bar dataKey="sessions" fill="#3b82f6" name="Sessions" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="users" fill="#8b5cf6" name="Utilisateurs" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pages sans trafic organique */}
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSearch className="w-4 h-4 text-orange-500" />
                    <h2 className="font-semibold text-gray-900">Pages sans trafic organique</h2>
                    {zeroPages?.has_data && (
                      <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                        {zeroPages.zero_organic_count} page{zeroPages.zero_organic_count > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {zeroPages?.has_data && (
                    <span className="text-xs text-gray-400">
                      {zeroPages.organic_pages_count} pages organiques / {zeroPages.all_pages_count} au total
                    </span>
                  )}
                </div>

                {zeroLoading ? (
                  <div className="p-6 flex justify-center">
                    <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : !zeroPages?.has_data ? (
                  <div className="p-6 text-center text-sm text-gray-400">{zeroPages?.reason ?? "Aucune donnée"}</div>
                ) : zeroPages.zero_organic_count === 0 ? (
                  <div className="p-6 text-center">
                    <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700">Toutes les pages reçoivent du trafic organique</p>
                    <p className="text-xs text-gray-400 mt-1">Sur les {period} derniers jours</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left">#</th>
                          <th className="px-4 py-3 text-left">Page</th>
                          <th className="px-4 py-3 text-right">Trafic organique</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(zeroPages.pages as string[]).map((page, i) => (
                          <tr key={page} className="hover:bg-orange-50/40">
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-700 max-w-xs truncate">{page}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">0 session</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Alerts + History table side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                  <AlertPanel websiteId={id} />
                </div>

                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
                  <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900">Historique détaillé</h2>
                    <span className="text-xs text-gray-400">{rows.length} jours</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-right">Sessions</th>
                          <th className="px-4 py-3 text-right">Utilisateurs</th>
                          <th className="px-4 py-3 text-right">Pages vues</th>
                          <th className="px-4 py-3 text-right">Rebond</th>
                          <th className="px-4 py-3 text-right">Durée moy.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {tableRows.map((d) => {
                          const isHigh = d.sessions > avgSessions * 1.5;
                          const isLow = avgSessions > 0 && d.sessions < avgSessions * 0.5;
                          return (
                            <tr key={d.date} className={`hover:bg-gray-50 ${isHigh ? "bg-green-50/50" : isLow ? "bg-red-50/50" : ""}`}>
                              <td className="px-4 py-2.5 text-gray-700 font-medium">
                                {fmtDate(d.date)}
                                {isHigh && <span className="ml-1.5 text-xs text-green-600 font-semibold">↑ pic</span>}
                                {isLow && <span className="ml-1.5 text-xs text-red-500 font-semibold">↓ bas</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{d.sessions.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600">{d.users.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600">{d.pageviews.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-right text-gray-500">
                                {d.bounce_rate != null ? `${d.bounce_rate}%` : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-500">
                                {fmtDuration(d.avg_session_duration)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
