"use client";
import Link from "next/link";
import { BarChart2, CheckCircle2 } from "lucide-react";

export default function BillingSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-violet-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">SEO Alert Scan</span>
        </div>

        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Paiement confirmé !</h1>
        <p className="text-gray-500 text-sm mb-6">
          Votre abonnement est actif. Connectez-vous pour accéder à votre dashboard et commencer à surveiller votre SEO.
        </p>

        <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-6 text-sm text-green-700">
          Un email de confirmation vous a été envoyé.
        </div>

        <Link href="/connexion"
          className="block w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
          Accéder à mon dashboard
        </Link>
        <Link href="/" className="block mt-3 text-sm text-gray-400 hover:underline">
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
