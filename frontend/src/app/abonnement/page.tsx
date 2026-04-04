"use client";
import { useState, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { Check, Zap, Globe, TrendingUp, Mail, ChevronRight, AlertTriangle, Lock, Loader2, Clock } from "lucide-react";

const PLAN_STYLES: Record<string, { border: string; badge: string; btn: string; icon: string }> = {
  starter: { border: "border-gray-200", badge: "bg-gray-100 text-gray-600", btn: "bg-gray-100 text-gray-700 hover:bg-gray-200", icon: "bg-gray-100 text-gray-500" },
  pro:     { border: "border-blue-400", badge: "bg-blue-100 text-blue-700", btn: "bg-blue-600 text-white hover:bg-blue-700", icon: "bg-blue-100 text-blue-600" },
  agency:  { border: "border-violet-400", badge: "bg-violet-100 text-violet-700", btn: "bg-violet-600 text-white hover:bg-violet-700", icon: "bg-violet-100 text-violet-600" },
};

const PLAN_ICONS: Record<string, React.ReactNode> = {
  starter: <Globe className="w-5 h-5" />,
  pro:     <Zap className="w-5 h-5" />,
  agency:  <TrendingUp className="w-5 h-5" />,
};

interface Plan {
  key: string; label: string; price: number; price_annual: number;
  sites_limit: number; features: string[]; is_current: boolean;
}

interface BillingData {
  plan: string; plan_label: string; plan_price: number; plan_price_annual: number; plan_color: string;
  plan_features: string[]; sites_used: number; sites_limit: number;
  usage_pct: number; plan_expires_at?: string; trial_ends_at?: string;
  all_plans: Plan[];
}

function formatPrice(p: number) {
  return p.toLocaleString("fr-FR") + " FCFA";
}

function getDaysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function BillingPageContent() {
  const searchParams = useSearchParams();
  const isExpired = searchParams.get("expired") === "1";
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  const { data, isLoading } = useQuery<BillingData>({
    queryKey: ["billing-me"],
    queryFn: async () => (await api.get("/billing/me")).data,
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ plan, billing }: { plan: string; billing: string }) =>
      (await api.post("/billing/create-checkout", { plan, billing })).data,
    onSuccess: (res) => {
      window.location.href = res.checkout_url;
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setCheckoutError(msg || "Erreur lors de la création du paiement");
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-[#f8fafc]">
        <Sidebar />
        <div className="flex-1"><TopNav title="Abonnement & Paiement" />
          <main className="p-6"><div className="text-gray-400">Chargement...</div></main>
        </div>
      </div>
    );
  }

  const styles = PLAN_STYLES[data?.plan || "starter"];
  const isUnlimited = data?.sites_limit === -1;
  const hasPaidPlan = data?.plan_expires_at && new Date(data.plan_expires_at) > new Date();
  const trialDaysLeft = data?.trial_ends_at ? getDaysLeft(data.trial_ends_at) : 0;
  const onTrial = !hasPaidPlan && trialDaysLeft > 0;

  const checkoutPlanData = data?.all_plans.find(p => p.key === checkoutPlan);
  const checkoutPrice = checkoutPlanData
    ? (billingPeriod === "annual" ? checkoutPlanData.price_annual : checkoutPlanData.price)
    : 0;

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopNav title="Abonnement & Paiement" />
        <main className="p-6 space-y-6 max-w-5xl">

          {/* Expired banner */}
          {isExpired && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 px-5 py-4 rounded-2xl">
              <Lock className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Votre essai gratuit est terminé</p>
                <p className="text-xs text-red-600 mt-0.5">Souscrivez à un plan ci-dessous pour retrouver l&apos;accès complet à votre dashboard.</p>
              </div>
            </div>
          )}

          {/* Trial status */}
          {onTrial && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-5 py-4 rounded-2xl">
              <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">
                  {trialDaysLeft === 1 ? "Votre essai expire demain !" : `Essai gratuit — ${trialDaysLeft} jour${trialDaysLeft > 1 ? "s" : ""} restant${trialDaysLeft > 1 ? "s" : ""}`}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Souscrivez maintenant pour ne pas perdre l&apos;accès à votre dashboard.</p>
              </div>
            </div>
          )}

          {checkoutError && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{checkoutError}</div>
          )}

          {/* Plan actuel */}
          <div className={`bg-white rounded-2xl border-2 ${styles.border} shadow-sm p-6`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 ${styles.icon} rounded-2xl flex items-center justify-center`}>
                  {PLAN_ICONS[data?.plan || "starter"]}
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Plan sélectionné</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <h2 className="text-xl font-bold text-gray-900">{data?.plan_label}</h2>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${hasPaidPlan ? styles.badge : "bg-amber-100 text-amber-700"}`}>
                      {hasPaidPlan ? "Actif" : onTrial ? "Essai" : "Expiré"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{formatPrice(data?.plan_price || 0)} / mois</p>
                </div>
              </div>
              {data?.plan_expires_at && hasPaidPlan && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-xl text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  Expire le {new Date(data.plan_expires_at).toLocaleDateString("fr-FR")}
                </div>
              )}
            </div>

            <div className="mt-6 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Sites surveillés</p>
                <p className="text-sm font-bold text-gray-900">
                  {data?.sites_used}{isUnlimited ? "" : ` / ${data?.sites_limit}`}
                  {isUnlimited && <span className="text-violet-500 ml-1">∞ illimité</span>}
                </p>
              </div>
              {!isUnlimited && (
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className={`h-2.5 rounded-full transition-all ${(data?.usage_pct || 0) >= 100 ? "bg-red-500" : (data?.usage_pct || 0) >= 75 ? "bg-amber-500" : "bg-blue-500"}`}
                    style={{ width: `${data?.usage_pct || 0}%` }} />
                </div>
              )}
            </div>

            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">Inclus dans votre plan</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {data?.plan_features.map(f => (
                  <div key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /> {f}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Toggle mensuel / annuel */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">
                {hasPaidPlan ? "Changer de plan" : "Souscrire à un plan"}
              </h3>
              <div className="inline-flex items-center gap-1 bg-gray-100 rounded-full p-1">
                <button
                  onClick={() => setBillingPeriod("monthly")}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${billingPeriod === "monthly" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                  Mensuel
                </button>
                <button
                  onClick={() => setBillingPeriod("annual")}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 ${billingPeriod === "annual" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                  Annuel
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded-full">-17%</span>
                </button>
              </div>
            </div>

            {billingPeriod === "annual" && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm mb-4">
                <span className="text-green-500">✓</span>
                <span><strong>2 mois offerts</strong> avec l&apos;abonnement annuel — économisez jusqu&apos;à 99 800 FCFA/an.</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data?.all_plans.map((plan) => {
                const s = PLAN_STYLES[plan.key];
                const price = billingPeriod === "annual" ? plan.price_annual : plan.price;
                const monthlyEquiv = billingPeriod === "annual" ? Math.round(plan.price_annual / 12) : plan.price;
                return (
                  <div key={plan.key}
                    className={`relative bg-white rounded-2xl border-2 p-5 flex flex-col transition-all ${plan.is_current && hasPaidPlan ? s.border + " shadow-md" : "border-gray-100 hover:border-gray-200 hover:shadow-sm"}`}>
                    {plan.is_current && hasPaidPlan && (
                      <div className={`absolute -top-3 left-4 text-xs font-bold px-3 py-0.5 rounded-full ${s.badge}`}>Plan actuel</div>
                    )}
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-8 h-8 ${s.icon} rounded-xl flex items-center justify-center`}>{PLAN_ICONS[plan.key]}</div>
                      <p className="font-bold text-gray-900">{plan.label}</p>
                    </div>
                    <p className="text-2xl font-extrabold text-gray-900 mb-0.5">{formatPrice(price)}</p>
                    <p className="text-xs text-gray-400 mb-1">
                      {billingPeriod === "annual" ? "par an" : "par mois"} · {plan.sites_limit === -1 ? "Sites illimités" : `${plan.sites_limit} site${plan.sites_limit > 1 ? "s" : ""}`}
                    </p>
                    {billingPeriod === "annual" && (
                      <p className="text-xs text-green-600 font-semibold mb-3">≈ {formatPrice(monthlyEquiv)}/mois · 2 mois offerts</p>
                    )}
                    {billingPeriod === "monthly" && <div className="mb-3" />}
                    <ul className="space-y-1.5 flex-1 mb-5">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                          <Check className="w-3 h-3 text-green-500 flex-shrink-0" />{f}
                        </li>
                      ))}
                    </ul>
                    {plan.is_current && hasPaidPlan ? (
                      <div className={`w-full text-center py-2.5 rounded-xl text-sm font-semibold ${s.badge}`}>Plan actuel</div>
                    ) : (
                      <button
                        onClick={() => { setCheckoutPlan(plan.key); setCheckoutError(""); }}
                        className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${s.btn}`}>
                        Souscrire <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Contact */}
          <div className="bg-gradient-to-r from-blue-600 to-violet-600 rounded-2xl p-6 text-white">
            <h3 className="font-bold text-lg mb-1">Besoin d&apos;aide ?</h3>
            <p className="text-blue-100 text-sm mb-4">Notre équipe répond à toutes vos questions sur la facturation et les plans.</p>
            <a href="mailto:contact@pixlstudio.africa"
              className="inline-flex items-center gap-2 bg-white text-blue-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-50 transition-colors">
              <Mail className="w-4 h-4" /> Contacter le support
            </a>
          </div>
        </main>
      </div>

      {/* Modal checkout Stripe */}
      {checkoutPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className={`w-12 h-12 ${PLAN_STYLES[checkoutPlan].icon} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
              {PLAN_ICONS[checkoutPlan]}
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-2">
              Souscrire au plan {checkoutPlanData?.label} — {billingPeriod === "annual" ? "Annuel" : "Mensuel"}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-1">
              {formatPrice(checkoutPrice)} / {billingPeriod === "annual" ? "an" : "mois"}
            </p>
            {billingPeriod === "annual" && (
              <p className="text-xs text-green-600 font-semibold text-center mb-2">2 mois offerts inclus !</p>
            )}
            <p className="text-xs text-gray-400 text-center mb-6">
              Paiement sécurisé via Stripe. Vous serez redirigé vers la page de paiement.
            </p>
            {checkoutError && <p className="text-xs text-red-500 text-center mb-3">{checkoutError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setCheckoutPlan(null)}
                className="flex-1 border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={() => checkoutMutation.mutate({ plan: checkoutPlan, billing: billingPeriod })}
                disabled={checkoutMutation.isPending}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-60 transition-colors ${PLAN_STYLES[checkoutPlan].btn}`}>
                {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Payer avec Stripe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>}>
      <BillingPageContent />
    </Suspense>
  );
}
