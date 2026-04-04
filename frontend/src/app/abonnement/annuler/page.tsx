"use client";
import Link from "next/link";
import { BarChart2, XCircle } from "lucide-react";

export default function BillingCancelPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">SEO Alert Scan</span>
        </div>

        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <XCircle className="w-8 h-8 text-red-400" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Paiement annulé</h1>
        <p className="text-gray-500 text-sm mb-6">
          Votre paiement n&apos;a pas été finalisé. Votre compte a été créé mais votre abonnement n&apos;est pas encore actif.
        </p>

        <Link href="/connexion"
          className="block w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors mb-3">
          Se connecter et réessayer
        </Link>
        <Link href="/" className="block text-sm text-gray-400 hover:underline">
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
