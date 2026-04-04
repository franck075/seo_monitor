"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Link from "next/link";
import { BarChart2, Check, ArrowRight, Loader2 } from "lucide-react";

const PLANS = [
  {
    key: "starter",
    label: "Starter",
    price: "5 900",
    sites: "1 site",
    activeColor: "border-blue-600 bg-blue-50",
    inactiveColor: "border-gray-200 hover:border-gray-400",
    badge: "",
    features: ["1 site monitoré", "Positions GSC", "Core Web Vitals", "Monitoring HTTP", "Alertes email"],
  },
  {
    key: "pro",
    label: "Pro",
    price: "17 900",
    sites: "5 sites",
    activeColor: "border-blue-600 bg-blue-50",
    inactiveColor: "border-gray-200 hover:border-blue-400",
    badge: "Populaire",
    features: ["5 sites monitorés", "Tout Starter +", "Trafic GA4", "Changements SEO", "Alertes Telegram", "Support prioritaire"],
  },
  {
    key: "agency",
    label: "Agence",
    price: "49 900",
    sites: "Illimité",
    activeColor: "border-violet-600 bg-violet-50",
    inactiveColor: "border-gray-200 hover:border-violet-400",
    badge: "",
    features: ["Sites illimités", "Tout Pro +", "Onboarding dédié", "Support premium"],
  },
];

function saveCookie(name: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

export default function RegisterPage() {
  const [step, setStep] = useState<"info" | "plan">("info");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleInfoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Mot de passe minimum 8 caractères."); return; }
    setError("");
    setStep("plan");
  }

  async function handleRegister() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/register", {
        email, password, full_name: fullName, plan: selectedPlan,
      });
      saveCookie("access_token", data.access_token);
      router.push("/tableau-de-bord");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Une erreur est survenue");
      setLoading(false);
    }
  }

  const plan = PLANS.find(p => p.key === selectedPlan)!;

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Left panel */}
      <div className="hidden lg:flex w-5/12 bg-gradient-to-br from-blue-600 to-violet-600 p-12 flex-col justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-lg">SEO Alert Scan</span>
        </div>
        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-3">7 jours gratuits, sans carte bancaire</h2>
            <p className="text-blue-100 text-base">Testez l&apos;outil dans son intégralité. Abonnez-vous uniquement si vous êtes convaincu.</p>
          </div>
          <ul className="space-y-3">
            {["Accès complet pendant 7 jours", "Données GSC, GA4 & PageSpeed", "Alertes email & Telegram", "Paiement sécurisé par Stripe après l'essai"].map(p => (
              <li key={p} className="flex items-center gap-3 text-white">
                <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3" />
                </div>
                <span className="text-sm">{p}</span>
              </li>
            ))}
          </ul>
          {/* Steps */}
          <div className="flex items-center gap-3">
            {["Vos infos", "Votre plan"].map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && <div className="w-8 h-px bg-white/30" />}
                <div className={`flex items-center gap-2 ${step === (i === 0 ? "info" : "plan") ? "text-white" : "text-blue-300"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === (i === 0 ? "info" : "plan") ? "bg-white text-blue-600" : "bg-white/30 text-white"}`}>{i + 1}</div>
                  <span className="text-sm font-medium">{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-blue-200 text-xs">© {new Date().getFullYear()} SEO Alert Scan</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-2xl">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">SEO Alert Scan</span>
          </div>

          {/* Step 1 */}
          {step === "info" && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Créer votre compte</h1>
              <p className="text-gray-500 text-sm mb-8">Étape 1 sur 2 — Vos informations</p>
              <form onSubmit={handleInfoSubmit} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="Jean Dupont" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="vous@exemple.com" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="8 caractères minimum" required minLength={8} />
                </div>
                {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>}
                <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                  Choisir mon plan <ArrowRight className="w-4 h-4" />
                </button>
              </form>
              <p className="text-center text-sm text-gray-500 mt-6">
                Déjà un compte ?{" "}
                <Link href="/connexion" className="text-blue-600 hover:underline font-medium">Se connecter</Link>
              </p>
              <p className="text-center text-sm text-gray-400 mt-2">
                <Link href="/" className="hover:underline">← Retour à l&apos;accueil</Link>
              </p>
            </>
          )}

          {/* Step 2 */}
          {step === "plan" && (
            <>
              <button onClick={() => setStep("info")} className="text-gray-400 hover:text-gray-600 text-sm mb-2">← Retour</button>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Choisissez votre plan</h1>
              <p className="text-gray-500 text-sm mb-6">Étape 2 sur 2 — Essai gratuit 7 jours, aucune carte requise</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {PLANS.map(p => (
                  <button key={p.key} onClick={() => setSelectedPlan(p.key)}
                    className={`relative text-left border-2 rounded-2xl p-4 bg-white transition-all ${selectedPlan === p.key ? p.activeColor : p.inactiveColor}`}>
                    {p.badge && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-0.5 rounded-full">{p.badge}</span>
                    )}
                    {selectedPlan === p.key && (
                      <div className="absolute top-3 right-3 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <p className="font-bold text-gray-900 text-base mb-0.5">{p.label}</p>
                    <p className="text-xs text-gray-400 mb-2">{p.sites}</p>
                    <p className="text-lg font-bold text-gray-900 mb-3">{p.price} <span className="text-xs font-normal text-gray-500">FCFA/mois</span></p>
                    <ul className="space-y-1.5">
                      {p.features.map(f => (
                        <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
                          <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />{f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>

              {/* Trial callout */}
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-800">7 jours gratuits — Plan {plan.label}</p>
                  <p className="text-xs text-green-600 mt-0.5">Aucune carte bancaire demandée. Vous pourrez souscrire depuis votre dashboard avant la fin de l&apos;essai.</p>
                </div>
              </div>

              {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}

              <button onClick={handleRegister} disabled={loading}
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 text-base">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Création du compte…</> : <>Commencer l&apos;essai gratuit <ArrowRight className="w-4 h-4" /></>}
              </button>
              <p className="text-center text-xs text-gray-400 mt-3">Sans engagement · Annulable à tout moment</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
