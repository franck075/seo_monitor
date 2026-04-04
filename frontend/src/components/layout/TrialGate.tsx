"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowRight, Loader2 } from "lucide-react";
import { AxiosError } from "axios";

const BYPASS_PATHS = ["/abonnement", "/parametres"];

export function TrialGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [trialExpired, setTrialExpired] = useState(false);

  const { data: billing, isLoading } = useQuery({
    queryKey: ["billing-me"],
    queryFn: async () => {
      try {
        return (await api.get("/billing/me")).data;
      } catch (e) {
        if ((e as AxiosError)?.response?.status === 403) {
          setTrialExpired(true);
        }
        throw e;
      }
    },
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!billing) return;
    const now = new Date();
    const hasPaid = billing.plan_expires_at && new Date(billing.plan_expires_at) > now;
    const hasTrial = billing.trial_ends_at && new Date(billing.trial_ends_at) > now;
    if (!hasPaid && !hasTrial) {
      setTrialExpired(true);
    }
  }, [billing]);

  // Allow billing and settings even with expired trial
  if (BYPASS_PATHS.some(p => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
      </div>
    );
  }

  if (trialExpired) {
    return <TrialExpiredPaywall onGoToBilling={() => router.push("/abonnement")} />;
  }

  return <>{children}</>;
}

function TrialExpiredPaywall({ onGoToBilling }: { onGoToBilling: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <Lock className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Essai terminé</h2>
        <p className="text-gray-500 text-sm mb-6">
          Votre période d&apos;essai gratuit de 7 jours est expirée. Souscrivez à un plan pour retrouver l&apos;accès complet à votre dashboard.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6 text-xs">
          {[
            { plan: "Starter", price: "5 900", sites: "1 site" },
            { plan: "Pro", price: "17 900", sites: "5 sites", highlight: true },
            { plan: "Agence", price: "49 900", sites: "Illimité" },
          ].map(p => (
            <div key={p.plan} className={`rounded-xl border p-3 ${p.highlight ? "border-blue-500 bg-blue-50" : "border-gray-100"}`}>
              <p className="font-semibold text-gray-900">{p.plan}</p>
              <p className="text-gray-500">{p.sites}</p>
              <p className="font-bold text-gray-900 mt-1">{p.price}<span className="font-normal text-gray-400"> F</span></p>
            </div>
          ))}
        </div>

        <button onClick={onGoToBilling}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
          Choisir un plan <ArrowRight className="w-4 h-4" />
        </button>
        <Link href="/connexion" className="block mt-3 text-sm text-gray-400 hover:underline">Se déconnecter</Link>
      </div>
    </div>
  );
}
