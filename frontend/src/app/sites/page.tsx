"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import Link from "next/link";
import { Globe, ExternalLink, Trash2 } from "lucide-react";

interface Site { id: number; domain: string; display_name?: string; health_score: number; is_active: boolean; }

function DeleteConfirmModal({ site, onConfirm, onCancel, isDeleting }: {
  site: Site; onConfirm: () => void; onCancel: () => void; isDeleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mx-auto mb-4">
          <Trash2 className="w-5 h-5 text-red-500" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 text-center">Supprimer ce site ?</h3>
        <p className="text-sm text-gray-500 text-center mt-2">
          <span className="font-medium text-gray-700">{site.display_name || site.domain}</span> et toutes ses données seront supprimés définitivement.
        </p>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={onConfirm} disabled={isDeleting}
            className="flex-1 bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-600 disabled:opacity-60">
            {isDeleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WebsitesPage() {
  const queryClient = useQueryClient();
  const [confirmSite, setConfirmSite] = useState<Site | null>(null);

  const { data: websites, isLoading } = useQuery({
    queryKey: ["websites"],
    queryFn: async () => (await api.get("/websites")).data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/websites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["websites"] });
      setConfirmSite(null);
    },
  });

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <TopNav title="Sites Web" />
        <main className="p-6">
          <div className="flex justify-between items-center mb-6">
            <p className="text-gray-500 text-sm">{websites?.length || 0} site(s) monitoré(s)</p>
            <Link href="/sites/nouveau" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              + Ajouter un site
            </Link>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Chargement...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {websites?.map((site: Site) => (
                <div key={site.id} className="group relative bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                  <button
                    onClick={() => setConfirmSite(site)}
                    className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 z-10"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <Link href={`/sites/${site.id}`} className="block">
                    <div className="flex items-start justify-between pr-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <Globe className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{site.display_name || site.domain}</p>
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            {site.domain} <ExternalLink className="w-3 h-3" />
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${site.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {site.is_active ? "Actif" : "Inactif"}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${site.health_score}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-600">{site.health_score}/100</span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {confirmSite && (
        <DeleteConfirmModal
          site={confirmSite}
          onConfirm={() => deleteMutation.mutate(confirmSite.id)}
          onCancel={() => setConfirmSite(null)}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
