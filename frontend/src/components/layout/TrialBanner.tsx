"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Link from "next/link";
import { Clock, AlertTriangle } from "lucide-react";

function getDaysLeft(isoDate: string): number {
  const end = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

export function TrialBanner() {
  const { data } = useQuery({
    queryKey: ["billing-me"],
    queryFn: async () => (await api.get("/billing/me")).data,
    staleTime: 60_000,
    retry: false,
  });

  if (!data) return null;

  // Already has active paid subscription
  if (data.plan_expires_at && new Date(data.plan_expires_at) > new Date()) return null;

  // No trial
  if (!data.trial_ends_at) return null;

  const daysLeft = getDaysLeft(data.trial_ends_at);

  // Trial expired — full paywall handled by TrialGate
  if (daysLeft <= 0) return null;

  const urgent = daysLeft <= 2;

  return (
    <div className={`px-6 py-2.5 flex items-center justify-between text-sm ${urgent ? "bg-red-50 border-b border-red-200" : "bg-amber-50 border-b border-amber-200"}`}>
      <div className="flex items-center gap-2">
        {urgent ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" /> : <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />}
        <span className={urgent ? "text-red-700 font-medium" : "text-amber-700"}>
          {daysLeft === 1
            ? "Votre essai gratuit expire demain !"
            : `Essai gratuit — ${daysLeft} jours restants`}
          {" "}Souscrivez pour conserver l&apos;accès.
        </span>
      </div>
      <Link href="/abonnement"
        className={`ml-4 text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${urgent ? "bg-red-600 text-white hover:bg-red-700" : "bg-amber-500 text-white hover:bg-amber-600"}`}>
        Voir les plans
      </Link>
    </div>
  );
}
