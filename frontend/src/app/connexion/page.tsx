"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { api } from "@/lib/api";
import Link from "next/link";
import { BarChart2 } from "lucide-react";

function safeRedirectTarget(from: string | null): string {
  if (!from) return "/tableau-de-bord";
  // Only allow internal paths to avoid open-redirect
  if (!from.startsWith("/") || from.startsWith("//")) return "/tableau-de-bord";
  return from;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/login", { email, password });
      Cookies.set("access_token", res.data.access_token, { expires: 1 });
      Cookies.set("refresh_token", res.data.refresh_token, { expires: 30 });
      const from = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("from")
        : null;
      router.push(safeRedirectTarget(from));
    } catch {
      setError("Email ou mot de passe incorrect");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Left panel */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-blue-600 to-violet-600 p-12 flex-col justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-lg">SEO Alert Scan</span>
        </div>
        <div>
          <p className="text-blue-100 text-sm mb-3">Ce que disent nos clients</p>
          <blockquote className="text-white text-xl font-medium leading-relaxed">
            "SEO Alert Scan m'a permis de détecter une chute de trafic en quelques minutes. Un outil indispensable pour tout webmaster sérieux."
          </blockquote>
          <p className="text-blue-200 text-sm mt-4">— Kofi A., Responsable SEO</p>
        </div>
        <p className="text-blue-200 text-xs">© {new Date().getFullYear()} SEO Alert Scan</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">SEO Alert Scan</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">Bienvenue</h1>
          <p className="text-gray-500 text-sm mb-8">Connectez-vous à votre espace de monitoring.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                placeholder="vous@exemple.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                placeholder="••••••••" required />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {loading ? "Connexion…" : "Se connecter"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Pas encore de compte ?{" "}
            <Link href="/inscription" className="text-blue-600 hover:underline font-medium">Créer un compte</Link>
          </p>
          <p className="text-center text-sm text-gray-400 mt-2">
            <Link href="/" className="hover:underline">← Retour à l'accueil</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
