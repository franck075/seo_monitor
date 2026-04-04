"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import {
  TrendingDown, Zap, MousePointerClick, Ghost,
  ExternalLink, ChevronDown, ChevronUp, ArrowDown, ArrowUp,
  Lightbulb, BarChart2, AlertTriangle, Eye,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type DropRow = { query: string; position_current: number; position_previous: number; delta: number; impressions: number; clicks: number; ctr: number };
type WinRow = { query: string; avg_position: number; total_impressions: number; total_clicks: number; avg_ctr: number };
type CtrRow = { query: string; avg_position: number; avg_ctr: number; total_impressions: number; total_clicks: number; lost_clicks_estimate: number };
type GhostRow = { query: string; avg_position: number; total_impressions: number; total_clicks: number };
type Summary = { position_drops: number; quick_wins: number; ctr_opportunities: number; ghost_keywords: number };

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortUrl(url: string | null): string {
  if (!url) return "—";
  try { return new URL(url).pathname || "/"; } catch { return url; }
}

function posColor(pos: number): string {
  if (pos <= 3) return "text-green-600";
  if (pos <= 10) return "text-yellow-600";
  return "text-red-500";
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
  id, icon: Icon, title, subtitle, count, accentBg, accentText, accentBorder,
  children, period,
}: {
  id: string; icon: React.ElementType; title: string; subtitle: string;
  count: number; accentBg: string; accentText: string; accentBorder: string;
  children: React.ReactNode; period: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`bg-white rounded-2xl border ${accentBorder} shadow-sm overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl ${accentBg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${accentText}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">{title}</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${accentBg} ${accentText}`}>
                {count}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle} · {period} derniers jours</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function Empty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <Lightbulb className="w-8 h-8 mb-2 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ── Table header ──────────────────────────────────────────────────────────────

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { id } = useParams<{ id: string }>();
  const [period, setPeriod] = useState(28);

  const { data: summary } = useQuery<Summary>({
    queryKey: ["insights-summary", id, period],
    queryFn: async () => (await api.get(`/websites/${id}/insights/summary?period=${period}`)).data,
  });

  const { data: drops = [], isLoading: dropsLoading } = useQuery<DropRow[]>({
    queryKey: ["insights-drops", id, period],
    queryFn: async () => (await api.get(`/websites/${id}/insights/position-drops?period=${period}`)).data,
  });

  const { data: wins = [], isLoading: winsLoading } = useQuery<WinRow[]>({
    queryKey: ["insights-wins", id, period],
    queryFn: async () => (await api.get(`/websites/${id}/insights/quick-wins?period=${period}`)).data,
  });

  const { data: ctrs = [], isLoading: ctrsLoading } = useQuery<CtrRow[]>({
    queryKey: ["insights-ctrs", id, period],
    queryFn: async () => (await api.get(`/websites/${id}/insights/ctr-opportunities?period=${period}`)).data,
  });

  const { data: ghosts = [], isLoading: ghostsLoading } = useQuery<GhostRow[]>({
    queryKey: ["insights-ghosts", id, period],
    queryFn: async () => (await api.get(`/websites/${id}/insights/ghost-keywords?period=${period}`)).data,
  });

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopNav title="Insights SEO" />
        <main className="flex-1 p-6 space-y-6">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-500" />
                Insights SEO
              </h1>
              <p className="text-sm text-gray-500 mt-1">Opportunités détectées automatiquement à partir de tes données GSC.</p>
            </div>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1 self-start sm:self-auto">
              {[7, 28, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setPeriod(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    period === d ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {d}j
                </button>
              ))}
            </div>
          </div>

          {/* ── KPI cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Chutes de position", value: summary?.position_drops ?? "—", icon: TrendingDown, bg: "bg-red-50", text: "text-red-600", border: "border-red-100" },
              { label: "Quick Wins", value: summary?.quick_wins ?? "—", icon: Zap, bg: "bg-yellow-50", text: "text-yellow-600", border: "border-yellow-100" },
              { label: "CTR à améliorer", value: summary?.ctr_opportunities ?? "—", icon: MousePointerClick, bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100" },
              { label: "Mots-clés fantômes", value: summary?.ghost_keywords ?? "—", icon: Ghost, bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-100" },
            ].map(({ label, value, icon: Icon, bg, text, border }) => (
              <div key={label} className={`bg-white rounded-2xl border ${border} p-4 flex items-center gap-3 shadow-sm`}>
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${text}`} />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${text}`}>{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Section 1 : Chutes de positions ── */}
          <Section
            id="drops" icon={TrendingDown} title="Chutes de positions"
            subtitle="Mots-clés qui ont perdu le plus de positions"
            count={drops.length} period={period}
            accentBg="bg-red-50" accentText="text-red-600" accentBorder="border-red-100"
          >
            {dropsLoading ? (
              <div className="py-10 text-center text-gray-400 text-sm">Chargement…</div>
            ) : drops.length === 0 ? (
              <Empty message="Aucune chute de position détectée sur cette période." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <Th>Mot-clé</Th>
                    <Th right>Position actuelle</Th>
                    <Th right>Période précédente</Th>
                    <Th right>Perte</Th>
                    <Th right>Impressions</Th>
                    <Th right>Clics</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {drops.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[260px] truncate">{row.query}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${posColor(row.position_current)}`}>{row.position_current.toFixed(1)}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{row.position_previous.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-0.5 text-red-600 font-semibold">
                          <ArrowDown className="w-3 h-3" />+{row.delta.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{row.impressions.toLocaleString("fr")}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{row.clicks.toLocaleString("fr")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* ── Section 2 : Quick Wins ── */}
          <Section
            id="wins" icon={Zap} title="Quick Wins"
            subtitle="Mots-clés en positions 2–10 à fort potentiel de trafic"
            count={wins.length} period={period}
            accentBg="bg-yellow-50" accentText="text-yellow-700" accentBorder="border-yellow-100"
          >
            {winsLoading ? (
              <div className="py-10 text-center text-gray-400 text-sm">Chargement…</div>
            ) : wins.length === 0 ? (
              <Empty message="Aucun quick win détecté. Continuez à optimiser !" />
            ) : (
              <>
                <div className="px-5 py-3 bg-yellow-50 text-xs text-yellow-800 flex items-start gap-2 border-b border-yellow-100">
                  <Lightbulb className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  Ces pages sont juste au seuil du top — améliore le contenu, les liens internes ou les métadonnées pour les faire monter.
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <Th>Mot-clé</Th>
                      <Th right>Position</Th>
                      <Th right>Impressions</Th>
                      <Th right>Clics</Th>
                      <Th right>CTR</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {wins.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-[300px] truncate">{row.query}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${posColor(row.avg_position)}`}>{row.avg_position.toFixed(1)}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{row.total_impressions.toLocaleString("fr")}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{row.total_clicks.toLocaleString("fr")}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{row.avg_ctr.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Section>

          {/* ── Section 3 : CTR à optimiser ── */}
          <Section
            id="ctr" icon={MousePointerClick} title="CTR à optimiser"
            subtitle="Bien positionnés mais peu cliqués — Title & Meta Description à retravailler"
            count={ctrs.length} period={period}
            accentBg="bg-blue-50" accentText="text-blue-600" accentBorder="border-blue-100"
          >
            {ctrsLoading ? (
              <div className="py-10 text-center text-gray-400 text-sm">Chargement…</div>
            ) : ctrs.length === 0 ? (
              <Empty message="Aucune opportunité CTR détectée sur cette période." />
            ) : (
              <>
                <div className="px-5 py-3 bg-blue-50 text-xs text-blue-800 flex items-start gap-2 border-b border-blue-100">
                  <Lightbulb className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  Ces pages ont une bonne position mais un CTR sous 4%. Rends ton Title plus accrocheur et ta Meta Description plus incitative.
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <Th>Mot-clé</Th>
                      <Th right>Position</Th>
                      <Th right>CTR actuel</Th>
                      <Th right>Impressions</Th>
                      <Th right>Clics perdus*</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ctrs.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-[300px] truncate">{row.query}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${posColor(row.avg_position)}`}>{row.avg_position.toFixed(1)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-orange-600">{row.avg_ctr.toFixed(1)}%</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{row.total_impressions.toLocaleString("fr")}</td>
                        <td className="px-4 py-3 text-right">
                          {row.lost_clicks_estimate > 0 ? (
                            <span className="text-red-500 font-semibold">−{row.lost_clicks_estimate.toLocaleString("fr")}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">* Estimation basée sur le CTR moyen attendu pour cette position.</p>
              </>
            )}
          </Section>

          {/* ── Section 4 : Mots-clés fantômes ── */}
          <Section
            id="ghosts" icon={Ghost} title="Mots-clés fantômes"
            subtitle="Impressions visibles mais aucun clic — peut indiquer un snippet riche ou un manque de pertinence"
            count={ghosts.length} period={period}
            accentBg="bg-purple-50" accentText="text-purple-600" accentBorder="border-purple-100"
          >
            {ghostsLoading ? (
              <div className="py-10 text-center text-gray-400 text-sm">Chargement…</div>
            ) : ghosts.length === 0 ? (
              <Empty message="Aucun mot-clé fantôme détecté." />
            ) : (
              <>
                <div className="px-5 py-3 bg-purple-50 text-xs text-purple-800 flex items-start gap-2 border-b border-purple-100">
                  <Eye className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  Google affiche ces pages mais personne ne clique. Vérifie si le Title est bien aligné avec l'intention de recherche.
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <Th>Mot-clé</Th>
                      <Th right>Position</Th>
                      <Th right>Impressions</Th>
                      <Th right>Clics</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ghosts.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-[340px] truncate">{row.query}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${posColor(row.avg_position)}`}>{row.avg_position.toFixed(1)}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{row.total_impressions.toLocaleString("fr")}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-1 text-purple-600 font-semibold">
                            <Ghost className="w-3 h-3" /> 0
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Section>

        </main>
      </div>
    </div>
  );
}
