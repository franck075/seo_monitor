"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";

export default function SettingsPage() {
  const qc = useQueryClient();
  const [provider, setProvider] = useState("gsc");
  const [label, setLabel] = useState("");
  const [credJson, setCredJson] = useState("");
  const [error, setError] = useState("");

  const { data: credentials } = useQuery({
    queryKey: ["credentials"],
    queryFn: async () => (await api.get("/auth/credentials")).data,
  });

  const addCred = useMutation({
    mutationFn: async () => {
      await api.post("/auth/credentials", {
        provider,
        label,
        credentials_json: JSON.parse(credJson),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credentials"] });
      setCredJson("");
      setLabel("");
      setError("");
    },
    onError: () => setError("JSON invalide ou erreur serveur"),
  });

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <TopNav title="Parametres" />
        <main className="p-6 max-w-2xl space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Ajouter des credentials Google</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service</label>
                <select value={provider} onChange={e => setProvider(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="gsc">Google Search Console</option>
                  <option value="ga4">Google Analytics 4</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etiquette</label>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)}
                  placeholder="Mon compte GSC principal"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">JSON Service Account</label>
                <textarea value={credJson} onChange={e => setCredJson(e.target.value)} rows={8}
                  placeholder='{"type": "service_account", "project_id": "...", ...}'
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button onClick={() => addCred.mutate()}
                disabled={!credJson || addCred.isPending}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {addCred.isPending ? "Ajout..." : "Ajouter"}
              </button>
            </div>
          </div>

          {credentials && credentials.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Credentials enregistres</h2>
              <div className="space-y-2">
                {credentials.map((c: { id: number; provider: string; label?: string; created_at: string }) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded mr-2">{c.provider.toUpperCase()}</span>
                      <span className="text-sm text-gray-700">{c.label || `Credential #${c.id}`}</span>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString("fr-FR")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
