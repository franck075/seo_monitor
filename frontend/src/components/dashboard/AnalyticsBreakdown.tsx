"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { ArrowUp, ArrowDown, Trophy, Monitor, Smartphone, Tablet } from "lucide-react";

type Weekday = { day: string; clicks: number; avg_clicks: number };
type Country = { country: string; country_label: string; clicks: number; impressions: number; change_pct: number | null; bar_pct: number };
type Device = { device: string; key: string; clicks: number };
type DeviceEvo = { date: string; desktop: number; mobile: number; tablet: number };
type Breakdown = {
  has_data: boolean;
  reason?: string;
  weekday?: Weekday[];
  best_day?: Weekday;
  countries?: Country[];
  devices?: Device[];
  device_evolution?: DeviceEvo[];
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + " M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(".", ",") + " k";
  return new Intl.NumberFormat("fr-FR").format(n);
}

function Change({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined) return <span className="text-xs text-gray-400">—</span>;
  const up = pct > 0;
  const color = pct === 0 ? "text-gray-400" : up ? "text-green-600" : "text-red-600";
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      {pct !== 0 && <Icon className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

const DEVICE_ICONS: Record<string, typeof Monitor> = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };
const DEVICE_COLORS: Record<string, string> = { desktop: "#3b82f6", mobile: "#8b5cf6", tablet: "#f59e0b" };

export function AnalyticsBreakdown({ siteId }: { siteId: number | null }) {
  const [deviceTab, setDeviceTab] = useState<"split" | "evolution">("split");

  const { data, isLoading } = useQuery<Breakdown>({
    queryKey: ["analytics-breakdown", siteId],
    queryFn: async () => (await api.get(`/websites/${siteId}/analytics/breakdown?period=90`)).data,
    enabled: !!siteId,
  });

  if (!siteId) return null;
  if (isLoading) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">Chargement…</div>;
  }
  if (!data?.has_data) return null;

  const maxWeekday = Math.max(...(data.weekday?.map((w) => w.avg_clicks) || [1]), 1);
  const totalDeviceClicks = (data.devices || []).reduce((s, d) => s + d.clicks, 0) || 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Clics par jour de la semaine ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4">Clics par jour de la semaine</h3>
        <div className="space-y-2.5">
          {data.weekday?.map((w) => (
            <div key={w.day} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-20 flex-shrink-0">{w.day}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div
                  className="bg-blue-400 h-full rounded-full transition-all"
                  style={{ width: `${(w.avg_clicks / maxWeekday) * 100}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-gray-900 w-10 text-right">{w.avg_clicks}</span>
            </div>
          ))}
        </div>
        {data.best_day && data.best_day.avg_clicks > 0 && (
          <div className="mt-4 bg-blue-50 rounded-xl px-4 py-2.5 text-sm text-blue-800 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span><b>{data.best_day.day}</b> est votre meilleur jour avec <b>{data.best_day.avg_clicks} clics</b> en moyenne</span>
          </div>
        )}
      </div>

      {/* ── Trafic par appareil ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Trafic par appareil</h3>
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            <button onClick={() => setDeviceTab("split")}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${deviceTab === "split" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}>
              Répartition
            </button>
            <button onClick={() => setDeviceTab("evolution")}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${deviceTab === "evolution" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}>
              Évolution
            </button>
          </div>
        </div>

        {deviceTab === "split" ? (
          <div className="space-y-3 pt-2">
            {data.devices?.map((d) => {
              const Icon = DEVICE_ICONS[d.key] || Monitor;
              const pct = Math.round((d.clicks / totalDeviceClicks) * 100);
              return (
                <div key={d.key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                      <Icon className="w-4 h-4" style={{ color: DEVICE_COLORS[d.key] }} /> {d.device}
                    </span>
                    <span className="font-semibold text-gray-900">{fmt(d.clicks)} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: DEVICE_COLORS[d.key] }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.device_evolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                tickFormatter={(v) => v.slice(5)} minTickGap={30} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="desktop" stackId="1" stroke="#3b82f6" fill="#dbeafe" name="Desktop" />
              <Area type="monotone" dataKey="mobile" stackId="1" stroke="#8b5cf6" fill="#ede9fe" name="Mobile" />
              <Area type="monotone" dataKey="tablet" stackId="1" stroke="#f59e0b" fill="#fef3c7" name="Tablet" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Trafic par pays ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm lg:col-span-2">
        <h3 className="font-semibold text-gray-900 mb-4">Trafic par pays</h3>
        <div className="space-y-2.5">
          {data.countries?.map((c) => (
            <div key={c.country} className="flex items-center gap-3">
              <span className="text-sm text-gray-700 w-32 flex-shrink-0 font-medium">{c.country_label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${c.bar_pct}%` }} />
              </div>
              <span className="text-sm font-semibold text-gray-900 w-16 text-right tabular-nums">{fmt(c.clicks)}</span>
              <span className="w-16 text-right"><Change pct={c.change_pct} /></span>
            </div>
          ))}
          {(!data.countries || data.countries.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4">Pas de données de pays sur la période.</p>
          )}
        </div>
      </div>
    </div>
  );
}
