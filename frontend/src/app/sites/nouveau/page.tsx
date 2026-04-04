"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TrendingUp, Check, X } from "lucide-react";

const PLANS = [
  { key: "pro", label: "Pro", price: "17 900 FCFA/mois", sites: "5 sites", color: "border-blue-500 bg-blue-50" },
  { key: "agency", label: "Agence", price: "49 900 FCFA/mois", sites: "Illimité", color: "border-violet-500 bg-violet-50" },
];

function UpgradeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="font-bold text-gray-900">Limite atteinte</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Votre plan actuel ne permet pas d'ajouter plus de sites. Passez à un plan supérieur pour continuer.
        </p>
        <div className="space-y-3 mb-6">
          {PLANS.map(p => (
            <div key={p.key} className={`border-2 rounded-xl p-4 ${p.color}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{p.label}</p>
                  <p className="text-xs text-gray-500">{p.sites}</p>
                </div>
                <p className="font-bold text-gray-900 text-sm">{p.price}</p>
              </div>
              <ul className="mt-2 space-y-1">
                {["Toutes les fonctionnalités", "Alertes email & Telegram", "Support prioritaire"].map(f => (
                  <li key={f} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <Check className="w-3 h-3 text-green-500" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center">
          Contactez-nous pour mettre à niveau votre compte :{" "}
          <a href="mailto:contact@pixlstudio.africa" className="text-blue-600 hover:underline">
            contact@pixlstudio.africa
          </a>
        </p>
      </div>
    </div>
  );
}

export default function NewWebsitePage() {
  const router = useRouter();
  const [form, setForm] = useState({ domain: "", display_name: "", gsc_property: "", ga4_property_id: "", timezone: "UTC" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { data: credentials } = useQuery({
    queryKey: ["credentials"],
    queryFn: async () => (await api.get("/auth/credentials")).data,
  });

  const [gscCredId, setGscCredId] = useState<number | "">("");
  const [ga4CredId, setGa4CredId] = useState<number | "">("");

  const gscCredentials = credentials?.filter((c: { provider: string }) => c.provider === "gsc") ?? [];
  const hasCredentials = gscCredentials.length > 0;
  const canSubmit = hasCredentials && gscCredId !== "" && form.gsc_property.trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      const payload = { ...form, gsc_cred_id: gscCredId || null, ga4_cred_id: ga4CredId || null };
      await api.post("/websites", payload);
      router.push("/sites");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (status === 403) {
        setShowUpgrade(true);
      } else {
        setError(message || "Erreur lors de la création du site");
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <Sidebar />
      <div className="flex-1">
        <TopNav title="Ajouter un site" />
        <main className="p-6 max-w-2xl">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Domaine *</label>
              <input type="text" placeholder="exemple.com" value={form.domain}
                onChange={e => setForm({...form, domain: e.target.value})} className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom affiché</label>
              <input type="text" placeholder="Mon site" value={form.display_name}
                onChange={e => setForm({...form, display_name: e.target.value})} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Propriété GSC</label>
              <input type="text" placeholder="https://exemple.com/ ou sc-domain:exemple.com"
                value={form.gsc_property} onChange={e => setForm({...form, gsc_property: e.target.value})} className={inputClass} />
              <p className="text-xs text-gray-400 mt-1">Doit correspondre exactement à la propriété dans Google Search Console</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Propriété GA4</label>
              <input type="text" placeholder="123456789" value={form.ga4_property_id}
                onChange={e => setForm({...form, ga4_property_id: e.target.value})} className={inputClass} />
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-4">
              <p className="text-sm font-semibold text-gray-800">Authentification Google <span className="text-red-500">*</span></p>

              {!hasCredentials ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <X className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Credential Google requis</p>
                    <p className="text-xs text-red-700 mt-1">
                      Vous devez d&apos;abord ajouter un Service Account JSON Google dans les paramètres avant de pouvoir ajouter un site. Sans cela, aucune donnée ne peut être collectée.
                    </p>
                    <Link href="/parametres" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-blue-600 hover:underline">
                      → Configurer dans Paramètres
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Credential GSC <span className="text-red-500">*</span>
                    </label>
                    <select value={gscCredId} onChange={e => setGscCredId(Number(e.target.value))} className={inputClass} required>
                      <option value="">Sélectionner un credential GSC...</option>
                      {gscCredentials.map((c: { id: number; label?: string }) => (
                        <option key={c.id} value={c.id}>{c.label || `Credential #${c.id}`}</option>
                      ))}
                    </select>
                    {gscCredId === "" && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <span>⚠</span> Sélectionnez un credential pour activer la collecte GSC.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Credential GA4 <span className="text-gray-400 font-normal">(optionnel)</span></label>
                    <select value={ga4CredId} onChange={e => setGa4CredId(Number(e.target.value))} className={inputClass}>
                      <option value="">Aucun (données GA4 désactivées)</option>
                      {credentials.filter((c: { provider: string }) => c.provider === "ga4").map((c: { id: number; label?: string }) => (
                        <option key={c.id} value={c.id}>{c.label || `Credential #${c.id}`}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Récapitulatif des prérequis */}
            {credentials !== undefined && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Prérequis pour activer le monitoring</p>
                <div className={`flex items-center gap-2 text-xs ${hasCredentials ? "text-green-700" : "text-red-600"}`}>
                  {hasCredentials ? <Check className="w-3.5 h-3.5 text-green-500" /> : <X className="w-3.5 h-3.5 text-red-500" />}
                  Credential GSC (Service Account JSON) {hasCredentials ? "configuré" : "manquant"}
                </div>
                <div className={`flex items-center gap-2 text-xs ${gscCredId !== "" ? "text-green-700" : "text-amber-600"}`}>
                  {gscCredId !== "" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <X className="w-3.5 h-3.5 text-amber-500" />}
                  Credential GSC {gscCredId !== "" ? "sélectionné" : "non sélectionné"}
                </div>
                <div className={`flex items-center gap-2 text-xs ${form.gsc_property.trim() ? "text-green-700" : "text-amber-600"}`}>
                  {form.gsc_property.trim() ? <Check className="w-3.5 h-3.5 text-green-500" /> : <X className="w-3.5 h-3.5 text-amber-500" />}
                  Propriété GSC {form.gsc_property.trim() ? "renseignée" : "manquante"}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={loading || !canSubmit}
                title={!canSubmit ? "Configurez d'abord le credential GSC et la propriété GSC" : ""}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {loading ? "Ajout..." : "Ajouter le site"}
              </button>
              <button type="button" onClick={() => router.back()}
                className="border border-gray-200 px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Annuler
              </button>
            </div>
          </form>
        </main>
      </div>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
