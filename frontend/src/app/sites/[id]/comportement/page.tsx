"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { Gem, Flame, TrendingUp, TrendingDown, Sparkles, XCircle, ExternalLink } from "lucide-react";

type Page = {
  page: string; sessions?: number; prev_sessions?: number; change_pct?: number;
  engagement_rate?: number; avg_engagement_time?: number; score?: number;
};
type PagesResponse = {
  has_data: boolean; reason?: string; period?: number;
  hidden_gems: Page[]; leaking: Page[]; surging: Page[];
  declining: Page[]; new_pages: Page[]; lost_pages: Page[];
};
type Channel = { channel: string; sessions: number; users: number; bounce_rate: number; engagement_rate: number; pages_per_session: number; pct: number };
type ChannelsResponse = {
  has_data: boolean; reason?: string;
  total_sessions: number; channels: Channel[]; channel_names: string[];
  series: Record<string, any>[];
};

const PERIODS = [
  { value: 28, label: "28 jours" }, { value: 90, label: "3 mois" }, { value: 180, label: "6 mois" },
];
const CHANNEL_COLORS = ["#6366f1", "#3b82f6", "#f59e0b", "#22c55e", "#eab308", "#9ca3af", "#ec4899", "#ef4444", "#14b8a6"];

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + "K";
  return new Intl.NumberFormat("fr-FR").format(n);
}
function shorten(u: string): string { try { return new URL(u).pathname; } catch { return u; } }
function pageHref(u: string): string { return u.startsWith("http") ? u : `https://${u}`; }

function PageCard({
  icon: Icon, title, subtitle, count, items, color, render,
}: {
  icon: typeof Gem; title: string; subtitle: string; count: number; color: string;
  items: Page[]; render: (p: Page) => React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-50 flex items-start justify-between">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}1a` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <span className="bg-gray-900 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">{count}</span>
      </div>
      <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
        {items.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Aucune page.</p>}
        {items.map((p, i) => (
          <div key={p.page + i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50">
            <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0">{i + 1}</span>
            <a href={pageHref(p.page)} target="_blank" rel="noopener"
              className="flex-1 min-w-0 group">
              <span className="text-sm text-gray-900 truncate block group-hover:text-blue-600" title={p.page}>{shorten(p.page)}</span>
            </a>
            <div className="flex-shrink-0 text-right">{render(p)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BehaviorPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [period, setPeriod] = useState(28);

  const { data: pages, isLoading: pagesLoading } = useQuery<PagesResponse>({
    queryKey: ["behavior-pages", id, period],
    queryFn: async () => (await api.get(`/websites/${id}/behavior/pages?period=${period}`)).data,
  });
  const { data: channels, isLoading: chLoading } = useQuery<ChannelsResponse>({
    queryKey: ["behavior-channels", id, period],
    queryFn: async () => (await api.get(`/websites/${id}/behavior/channels?period=${Math.max(period, 90)}`)).data,
  });

  const noGa4 = pages && !pages.has_data;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopNav title="Comportement (GA4)" />
        <main className="p-6 space-y-8 max-w-6xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Comportement & Acquisition</h1>
              <p className="text-sm text-gray-500 mt-1">Analyse Google Analytics 4 : opportunités, mouvements et canaux.</p>
            </div>
            <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {noGa4 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-800 text-sm">
              <p className="font-semibold">GA4 non configuré</p>
              <p>{pages?.reason || "Connectez Google Analytics 4 pour ce site dans les paramètres."}</p>
            </div>
          )}

          {pagesLoading && <div className="text-center py-12 text-gray-400">Chargement…</div>}

          {pages?.has_data && (
            <>
              {/* ── Opportunités & Alertes ── */}
              <section>
                <h2 className="font-semibold text-gray-900 mb-3">Opportunités & Alertes</h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <PageCard icon={Gem} color="#22c55e" title="Hidden Gems"
                    subtitle="Excellent engagement, peu de trafic"
                    count={pages.hidden_gems.length} items={pages.hidden_gems}
                    render={(p) => (
                      <div>
                        <span className="text-green-600 font-semibold text-sm">score {p.score}</span>
                        <div className="text-xs text-gray-400">{p.engagement_rate}% eng · {fmt(p.sessions)} sess.</div>
                      </div>
                    )} />
                  <PageCard icon={Flame} color="#ef4444" title="Pages qui fuient"
                    subtitle="Du trafic mais engagement très faible"
                    count={pages.leaking.length} items={pages.leaking}
                    render={(p) => (
                      <div>
                        <span className="text-red-600 font-semibold text-sm">{p.engagement_rate}% eng.</span>
                        <div className="text-xs text-gray-400">{fmt(p.sessions)} sessions</div>
                      </div>
                    )} />
                  <PageCard icon={TrendingUp} color="#16a34a" title="En forte hausse"
                    subtitle="Plus forte hausse vs période précédente"
                    count={pages.surging.length} items={pages.surging}
                    render={(p) => (
                      <div>
                        <span className="text-green-600 font-semibold text-sm">+{p.change_pct}%</span>
                        <div className="text-xs text-gray-400">{fmt(p.prev_sessions)} → {fmt(p.sessions)}</div>
                      </div>
                    )} />
                </div>
              </section>

              {/* ── Suivi & Évolutions ── */}
              <section>
                <h2 className="font-semibold text-gray-900 mb-3">Suivi & Évolutions</h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <PageCard icon={TrendingDown} color="#ef4444" title="En baisse"
                    subtitle="Plus forte baisse de trafic"
                    count={pages.declining.length} items={pages.declining}
                    render={(p) => (
                      <div>
                        <span className="text-red-600 font-semibold text-sm">{p.change_pct}%</span>
                        <div className="text-xs text-gray-400">{fmt(p.prev_sessions)} → {fmt(p.sessions)}</div>
                      </div>
                    )} />
                  <PageCard icon={Sparkles} color="#3b82f6" title="Nouvelles pages"
                    subtitle="Apparues dans la période actuelle"
                    count={pages.new_pages.length} items={pages.new_pages}
                    render={(p) => (
                      <div>
                        <span className="text-blue-600 font-semibold text-sm">{fmt(p.sessions)} sess.</span>
                        <div className="text-xs text-gray-400">{p.engagement_rate}% eng.</div>
                      </div>
                    )} />
                  <PageCard icon={XCircle} color="#f59e0b" title="Pages perdues"
                    subtitle="Avaient du trafic, plus rien maintenant"
                    count={pages.lost_pages.length} items={pages.lost_pages}
                    render={(p) => (
                      <span className="text-amber-600 font-semibold text-sm">{fmt(p.prev_sessions)} perdues</span>
                    )} />
                </div>
              </section>
            </>
          )}

          {/* ── Canaux d'acquisition ── */}
          {channels?.has_data && (
            <section>
              <h2 className="font-semibold text-gray-900 mb-3">Canaux d'acquisition</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {/* Donut */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3">Répartition par canal</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={channels.channels} dataKey="sessions" nameKey="channel" innerRadius={55} outerRadius={85} paddingAngle={1}>
                        {channels.channels.map((c, i) => <Cell key={c.channel} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Details table */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm overflow-x-auto">
                  <h3 className="font-semibold text-gray-900 mb-3">Détails par canal</h3>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase border-b border-gray-100">
                      <tr>
                        <th className="text-left py-2 font-semibold">Canal</th>
                        <th className="text-right py-2 font-semibold">Sessions</th>
                        <th className="text-right py-2 font-semibold">%</th>
                        <th className="text-right py-2 font-semibold">Eng.</th>
                        <th className="text-right py-2 font-semibold">Bounce</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {channels.channels.map((c, i) => (
                        <tr key={c.channel}>
                          <td className="py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                              {c.channel}
                            </span>
                          </td>
                          <td className="py-2 text-right tabular-nums">{fmt(c.sessions)}</td>
                          <td className="py-2 text-right tabular-nums text-gray-500">{c.pct}%</td>
                          <td className="py-2 text-right tabular-nums">{c.engagement_rate}%</td>
                          <td className="py-2 text-right tabular-nums">{c.bounce_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Stacked time series */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-1">Sources de trafic dans le temps</h3>
                <p className="text-xs text-gray-400 mb-4">Sessions par canal d'acquisition — barres empilées</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={channels.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v.slice(5)} minTickGap={30} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {channels.channel_names.map((ch, i) => (
                      <Bar key={ch} dataKey={ch} stackId="s" fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} name={ch} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
