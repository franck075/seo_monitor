"use client";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import Link from "next/link";

interface SitemapSnapshot {
  id: number;
  sitemap_url: string;
  url_count: number;
  recorded_at: string;
}

interface SitemapURL {
  id: number;
  url: string;
  lastmod?: string;
  status: "present" | "added" | "removed";
}

export default function SitemapsPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const queryClient = useQueryClient();
  const [selectedSnapshot, setSelectedSnapshot] = useState<number | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [fetchSuccess, setFetchSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "present" | "added" | "removed">("all");

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["sitemaps", id],
    queryFn: async () => {
      const res = await api.get(`/websites/${id}/sitemaps`);
      return res.data as SitemapSnapshot[];
    },
  });

  useEffect(() => {
    if (snapshots?.length && !selectedSnapshot) {
      setSelectedSnapshot(snapshots[0].id);
    }
  }, [snapshots, selectedSnapshot]);

  const { data: urls, isLoading: urlsLoading } = useQuery({
    queryKey: ["sitemap-urls", selectedSnapshot],
    queryFn: async () => {
      const res = await api.get(`/websites/${id}/sitemaps/${selectedSnapshot}/urls`);
      return res.data as SitemapURL[];
    },
    enabled: !!selectedSnapshot,
  });

  const filteredUrls = statusFilter === "all" ? (urls ?? []) : (urls ?? []).filter((u) => u.status === statusFilter);
  const added = urls?.filter((u) => u.status === "added") ?? [];
  const removed = urls?.filter((u) => u.status === "removed") ?? [];
  const present = urls?.filter((u) => u.status === "present") ?? [];

  async function handleFetch() {
    if (!manualUrl.trim()) return;
    setFetching(true);
    setFetchError("");
    setFetchSuccess("");
    try {
      const res = await api.post(`/websites/${id}/sitemaps/fetch`, { sitemap_url: manualUrl.trim() });
      const snap = res.data;
      const indexNote = snap.is_index ? ` (index → ${snap.child_count} sous-sitemaps)` : "";
      setFetchSuccess(`✓ Sitemap extrait${indexNote} — ${snap.url_count} URLs trouvées`);
      setManualUrl("");
      await queryClient.invalidateQueries({ queryKey: ["sitemaps", id] });
      setSelectedSnapshot(snap.id);
    } catch (e: any) {
      setFetchError(e?.response?.data?.detail ?? "Erreur lors de l'extraction");
    } finally {
      setFetching(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setFetchError("");
    setFetchSuccess("");
    try {
      const res = await api.post(`/websites/${id}/sitemaps/refresh`);
      const snap = res.data;
      setFetchSuccess(`✓ Rafraîchi — ${snap.url_count} URLs`);
      await queryClient.invalidateQueries({ queryKey: ["sitemaps", id] });
      setSelectedSnapshot(snap.id);
    } catch (e: any) {
      setFetchError(e?.response?.data?.detail ?? "Erreur lors du rafraîchissement");
    } finally {
      setRefreshing(false);
    }
  }

  const selectedSnap = snapshots?.find((s) => s.id === selectedSnapshot);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <TopNav title="Sitemaps" />
        <main className="p-6 space-y-5">
          <div>
            <Link href={`/sites/${id}`} className="text-sm text-blue-600 hover:underline">
              ← Retour au site
            </Link>
          </div>

          {/* Manual fetch form */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Extraire un sitemap</h2>
            <p className="text-sm text-gray-500 mb-4">
              Entrez l'URL d'un sitemap XML pour l'importer immédiatement. Vous pouvez aussi rafraîchir le sitemap par défaut (<code className="text-xs bg-gray-100 px-1 rounded">/sitemap.xml</code>).
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                placeholder="https://example.com/sitemap.xml"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleFetch}
                disabled={fetching || !manualUrl.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {fetching ? "Extraction..." : "Extraire"}
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                title="Rafraîchir le sitemap par défaut (/sitemap.xml)"
              >
                {refreshing ? "..." : "↻ Rafraîchir"}
              </button>
            </div>
            {fetchError && (
              <p className="mt-2 text-sm text-red-600">{fetchError}</p>
            )}
            {fetchSuccess && (
              <p className="mt-2 text-sm text-green-600">{fetchSuccess}</p>
            )}
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Chargement...</div>
          ) : !snapshots?.length ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              Aucun sitemap enregistré. Entrez une URL ci-dessus ou attendez la détection automatique.
            </div>
          ) : (
            <>
              {/* Snapshot history */}
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="p-5 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Historique des extractions</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">URL du sitemap</th>
                        <th className="px-4 py-3 text-right">URLs</th>
                        <th className="px-4 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {snapshots.map((snap) => (
                        <tr
                          key={snap.id}
                          className={`hover:bg-gray-50 cursor-pointer ${selectedSnapshot === snap.id ? "bg-blue-50" : ""}`}
                          onClick={() => setSelectedSnapshot(snap.id)}
                        >
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                            {new Date(snap.recorded_at).toLocaleString("fr-FR")}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[300px] truncate" title={snap.sitemap_url}>
                            {snap.sitemap_url}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">{snap.url_count}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedSnapshot(snap.id); }}
                              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                                selectedSnapshot === snap.id
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "border-gray-200 text-blue-600 hover:bg-blue-50"
                              }`}
                            >
                              Voir les URLs
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* URL list */}
              {selectedSnapshot && (
                <div className="bg-white rounded-xl border border-gray-200">
                  <div className="p-5 border-b border-gray-100 flex flex-wrap items-center gap-3">
                    <div>
                      <h2 className="font-semibold text-gray-900">URLs du snapshot</h2>
                      {selectedSnap && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[400px]">{selectedSnap.sitemap_url}</p>
                      )}
                    </div>
                    <div className="flex gap-2 text-xs ml-auto flex-wrap">
                      {added.length > 0 && (
                        <button
                          onClick={() => setStatusFilter(statusFilter === "added" ? "all" : "added")}
                          className={`px-2 py-0.5 rounded-full font-medium transition-colors ${statusFilter === "added" ? "bg-green-600 text-white" : "bg-green-100 text-green-700 hover:bg-green-200"}`}
                        >
                          +{added.length} ajoutées
                        </button>
                      )}
                      {removed.length > 0 && (
                        <button
                          onClick={() => setStatusFilter(statusFilter === "removed" ? "all" : "removed")}
                          className={`px-2 py-0.5 rounded-full font-medium transition-colors ${statusFilter === "removed" ? "bg-red-600 text-white" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
                        >
                          -{removed.length} supprimées
                        </button>
                      )}
                      <button
                        onClick={() => setStatusFilter(statusFilter === "present" ? "all" : "present")}
                        className={`px-2 py-0.5 rounded-full font-medium transition-colors ${statusFilter === "present" ? "bg-gray-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                      >
                        {present.length} présentes
                      </button>
                      {statusFilter !== "all" && (
                        <button onClick={() => setStatusFilter("all")} className="text-blue-600 hover:underline">
                          Tout afficher
                        </button>
                      )}
                    </div>
                  </div>

                  {urlsLoading ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Chargement des URLs...</div>
                  ) : filteredUrls.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Aucune URL trouvée.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                          <tr>
                            <th className="px-4 py-3 text-left">URL</th>
                            <th className="px-4 py-3 text-center">Statut</th>
                            <th className="px-4 py-3 text-right">Dernière modif.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredUrls.map((u) => (
                            <tr key={u.id} className={`hover:bg-gray-50 ${u.status === "removed" ? "opacity-50" : ""}`}>
                              <td className="px-4 py-2.5 text-gray-700 max-w-[500px] truncate text-xs" title={u.url}>
                                <a href={u.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 hover:underline">
                                  {u.url}
                                </a>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {u.status === "added" && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Ajoutée</span>
                                )}
                                {u.status === "removed" && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Supprimée</span>
                                )}
                                {u.status === "present" && (
                                  <span className="text-xs text-gray-400">Présente</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                                {u.lastmod ? new Date(u.lastmod).toLocaleDateString("fr-FR") : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-right">
                        {filteredUrls.length} URL{filteredUrls.length > 1 ? "s" : ""} affichée{filteredUrls.length > 1 ? "s" : ""}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
