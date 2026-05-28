"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "@/lib/api";
import { Settings, Plus, Trash2, X, ArrowUp, ArrowDown, Tag } from "lucide-react";

type ClusterDef = { id: number; name: string; color: string; terms: string[]; is_brand: boolean; position: number };
type ClusterRow = ClusterDef & {
  clicks: number; impressions: number; keywords: number;
  clicks_change_pct: number | null; impressions_change_pct: number | null;
};
type UncatQuery = { query: string; clicks: number; impressions: number; ctr: number; position: number };
type ClustersResponse = {
  has_data: boolean; reason?: string; period?: number;
  clusters: ClusterRow[];
  uncategorized: { clicks: number; impressions: number; keywords: number; queries: UncatQuery[] };
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + " K";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(".", ",") + " K";
  return new Intl.NumberFormat("fr-FR").format(n);
}

function Change({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined) return null;
  const up = pct > 0;
  const color = pct === 0 ? "text-gray-400" : up ? "text-green-600" : "text-red-600";
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      {pct !== 0 && <Icon className="w-3 h-3" />}{Math.abs(pct).toFixed(0)}%
    </span>
  );
}

const PALETTE = ["#3b82f6", "#f59e0b", "#ef4444", "#22c55e", "#8b5cf6", "#06b6d4", "#ec4899", "#f97316", "#14b8a6", "#a855f7"];

function ClusterManager({ siteId, defs, onClose }: { siteId: number; defs: ClusterDef[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ClusterDef[]>(defs.length ? defs : []);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["clusters-defs", siteId] });
    qc.invalidateQueries({ queryKey: ["analytics-clusters", siteId] });
  };

  const createM = useMutation({
    mutationFn: async (c: Partial<ClusterDef>) =>
      (await api.post(`/websites/${siteId}/analytics/clusters/definitions`, c)).data,
    onSuccess: invalidate,
  });
  const updateM = useMutation({
    mutationFn: async (c: ClusterDef) =>
      (await api.put(`/websites/${siteId}/analytics/clusters/definitions/${c.id}`, c)).data,
    onSuccess: invalidate,
  });
  const deleteM = useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`/websites/${siteId}/analytics/clusters/definitions/${id}`)).data,
    onSuccess: invalidate,
  });

  const [newName, setNewName] = useState("");
  const [newTerms, setNewTerms] = useState("");
  const [newBrand, setNewBrand] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Gérer les clusters de mots-clés</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-3">
          <p className="text-xs text-gray-500">
            Un mot-clé GSC tombe dans le premier cluster dont l'un des termes est contenu dans la requête.
            Séparez les termes par des virgules.
          </p>

          {rows.map((c, i) => (
            <div key={c.id} className="border border-gray-150 rounded-xl p-3 flex items-start gap-3">
              <input type="color" value={c.color}
                onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, color: e.target.value } : r))}
                className="w-8 h-8 rounded cursor-pointer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <input value={c.name}
                  onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium" placeholder="Nom du cluster" />
                <input value={c.terms.join(", ")}
                  onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, terms: e.target.value.split(",").map(t => t.trim()) } : r))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono" placeholder="termes, séparés, par, virgules" />
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={c.is_brand}
                    onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, is_brand: e.target.checked } : r))} />
                  Cluster de marque
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => updateM.mutate(c)}
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700">Enreg.</button>
                <button onClick={() => { deleteM.mutate(c.id); setRows(rows.filter((_, j) => j !== i)); }}
                  className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded-md inline-flex items-center gap-1">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          {/* Add new */}
          <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600">Nouveau cluster</p>
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" placeholder="Nom (ex. Outils SEO)" />
            <input value={newTerms} onChange={(e) => setNewTerms(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono" placeholder="outil, logiciel, software" />
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={newBrand} onChange={(e) => setNewBrand(e.target.checked)} /> Cluster de marque
              </label>
              <button
                disabled={!newName.trim()}
                onClick={() => {
                  createM.mutate({
                    name: newName.trim(),
                    terms: newTerms.split(",").map(t => t.trim()).filter(Boolean),
                    color: PALETTE[rows.length % PALETTE.length],
                    is_brand: newBrand,
                    position: rows.length,
                  });
                  setNewName(""); setNewTerms(""); setNewBrand(false);
                }}
                className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1">
                <Plus className="w-4 h-4" /> Ajouter
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClusterDonut({ title, data, valueKey }: { title: string; data: ClusterRow[]; valueKey: "clicks" | "impressions" }) {
  const total = data.reduce((s, c) => s + c[valueKey], 0);
  const pieData = data.filter((c) => c[valueKey] > 0).map((c) => ({ name: c.name, value: c[valueKey], color: c.color }));
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="flex items-center gap-4">
        <div className="relative w-40 h-40 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={1}>
                {pieData.map((e) => <Cell key={e.name} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-gray-900">{fmt(total)}</span>
            <span className="text-[10px] text-gray-400">{valueKey === "clicks" ? "clics" : "impressions"}</span>
          </div>
        </div>
        <div className="flex-1 space-y-1 max-h-44 overflow-y-auto">
          {data.slice(0, 10).map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-gray-700 truncate">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                <span className="truncate">{c.name}</span>
              </span>
              <span className="flex items-center gap-1.5 flex-shrink-0">
                <span className="font-semibold text-gray-900">{fmt(c[valueKey])}</span>
                <Change pct={valueKey === "clicks" ? c.clicks_change_pct : c.impressions_change_pct} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsClusters({ siteId }: { siteId: number | null }) {
  const [managing, setManaging] = useState(false);

  const { data: defsData } = useQuery<{ clusters: ClusterDef[] }>({
    queryKey: ["clusters-defs", siteId],
    queryFn: async () => (await api.get(`/websites/${siteId}/analytics/clusters/definitions`)).data,
    enabled: !!siteId,
  });

  const { data, isLoading } = useQuery<ClustersResponse>({
    queryKey: ["analytics-clusters", siteId],
    queryFn: async () => (await api.get(`/websites/${siteId}/analytics/clusters?period=28`)).data,
    enabled: !!siteId,
  });

  if (!siteId) return null;

  const defs = defsData?.clusters || [];
  const hasClusters = defs.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Clusters de mots-clés</h2>
        <button onClick={() => setManaging(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
          <Settings className="w-4 h-4" /> Gérer les clusters
        </button>
      </div>

      {!hasClusters && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Tag className="w-6 h-6 text-blue-400" />
          </div>
          <p className="font-medium text-gray-700">Aucun cluster défini</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Créez des clusters thématiques pour regrouper vos mots-clés.</p>
          <button onClick={() => setManaging(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Créer un cluster
          </button>
        </div>
      )}

      {hasClusters && isLoading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">Chargement…</div>
      )}

      {hasClusters && !isLoading && data?.has_data && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ClusterDonut title="Clics par cluster" data={data.clusters} valueKey="clicks" />
            <ClusterDonut title="Impressions par cluster" data={data.clusters} valueKey="impressions" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cluster cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
              {data.clusters.map((c) => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="font-semibold text-gray-900 text-sm truncate">{c.name}</span>
                    {c.is_brand && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Marque</span>}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-gray-400">Clics</span>
                      <span className="font-semibold text-gray-900">{fmt(c.clicks)}</span>
                      <Change pct={c.clicks_change_pct} />
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="text-gray-400">Impr.</span>
                      <span className="font-semibold text-gray-900">{fmt(c.impressions)}</span>
                      <Change pct={c.impressions_change_pct} />
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">{c.keywords} mots-clés</p>
                </div>
              ))}
            </div>

            {/* Uncategorized */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900">Mots-clés non catégorisés</h3>
              <p className="text-xs text-gray-400 mb-3">{fmt(data.uncategorized.keywords)} mots-clés · {fmt(data.uncategorized.clicks)} clics</p>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Mot-clé</th>
                      <th className="text-right px-2 py-2 font-semibold">Clics</th>
                      <th className="text-right px-2 py-2 font-semibold">Impr.</th>
                      <th className="text-right px-3 py-2 font-semibold">Pos.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.uncategorized.queries.map((q) => (
                      <tr key={q.query} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-900 max-w-[200px] truncate" title={q.query}>{q.query}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-blue-600">{fmt(q.clicks)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-violet-600">{fmt(q.impressions)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">{q.position.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {managing && <ClusterManager siteId={siteId} defs={defs} onClose={() => setManaging(false)} />}
    </div>
  );
}
