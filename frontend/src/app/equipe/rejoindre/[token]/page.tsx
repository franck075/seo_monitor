"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, CheckCircle, XCircle, Clock, Eye, EyeOff, Loader2 } from "lucide-react";

interface InvitationInfo {
  email: string;
  owner_full_name: string | null;
  role: string;
  expires_at: string;
  status: string;
}

const API = "/api/v1";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Erreur serveur");
  return data;
}

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export default function RejoindreEquipePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const { token } = params;

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Auth state
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [wrongAccount, setWrongAccount] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd] = useState("");

  // Register form
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPwd, setRegPwd] = useState("");

  // Accept state
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const tkn = getToken();
    setLoggedIn(!!tkn);
    if (tkn) fetchCurrentUser(tkn);
    fetchInvitation();
  }, [token]);

  async function fetchCurrentUser(tkn: string) {
    try {
      const data = await apiFetch("/auth/me", {
        headers: { "Authorization": `Bearer ${tkn}` },
      });
      setCurrentUserEmail(data.email);
    } catch { /* token expired or invalid */ }
  }

  // Pre-fill email from invitation + detect wrong account
  useEffect(() => {
    if (invitation?.email) {
      setLoginEmail(invitation.email);
      setRegEmail(invitation.email);
    }
    if (invitation?.email && currentUserEmail) {
      setWrongAccount(invitation.email.toLowerCase() !== currentUserEmail.toLowerCase());
    }
  }, [invitation, currentUserEmail]);

  async function fetchInvitation() {
    try {
      const data = await apiFetch(`/team/join/${token}`);
      setInvitation(data);
    } catch (err: any) {
      setInviteError(err.message || "Invitation introuvable ou lien invalide.");
    } finally {
      setLoadingInvite(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPwd }),
      });
      localStorage.setItem("access_token", data.access_token);
      if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
      setLoggedIn(true);
      // immediately accept
      await acceptInvitation(data.access_token);
    } catch (err: any) {
      setAuthError(err.message || "Email ou mot de passe incorrect.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      // Register
      await apiFetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regEmail, password: regPwd, full_name: regName }),
      });
      // Auto-login after register
      const data = await apiFetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regEmail, password: regPwd }),
      });
      localStorage.setItem("access_token", data.access_token);
      if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
      setLoggedIn(true);
      await acceptInvitation(data.access_token);
    } catch (err: any) {
      setAuthError(err.message || "Erreur lors de la création du compte.");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setLoggedIn(false);
    setCurrentUserEmail(null);
    setWrongAccount(false);
    setAuthError("");
  }

  async function acceptInvitation(authToken?: string) {
    setAccepting(true);
    const tkn = authToken || getToken();
    try {
      await apiFetch(`/team/join/${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tkn}`,
        },
      });
      setAccepted(true);
      setTimeout(() => router.push("/tableau-de-bord"), 2000);
    } catch (err: any) {
      setAuthError(err.message || "Erreur lors de l'acceptation de l'invitation.");
    } finally {
      setAccepting(false);
    }
  }

  const roleLabel = invitation?.role === "editor" ? "Éditeur" : "Lecteur";
  const isExpired = invitation && new Date(invitation.expires_at) < new Date();
  const isCancelled = invitation?.status === "cancelled";
  const isAlreadyAccepted = invitation?.status === "accepted";

  // ── Loading ──
  if (loadingInvite) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-violet-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // ── Invitation invalide ──
  if (inviteError && !invitation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-violet-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
          <XCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation invalide</h1>
          <p className="text-gray-500 text-sm mb-6">{inviteError}</p>
          <a href="/connexion" className="text-sm text-blue-600 hover:underline">Se connecter</a>
        </div>
      </div>
    );
  }

  // ── États spéciaux ──
  if (isExpired || isCancelled || isAlreadyAccepted) {
    const msg = isCancelled ? "Cette invitation a été annulée par l'administrateur."
      : isAlreadyAccepted ? "Cette invitation a déjà été acceptée."
      : "Ce lien d'invitation a expiré. Demandez un nouveau lien.";
    const Icon = isCancelled ? XCircle : isAlreadyAccepted ? CheckCircle : Clock;
    const color = isCancelled ? "text-red-400" : isAlreadyAccepted ? "text-green-400" : "text-orange-400";
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-violet-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
          <Icon className={`w-14 h-14 ${color} mx-auto mb-4`} />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {isCancelled ? "Invitation annulée" : isAlreadyAccepted ? "Déjà acceptée" : "Invitation expirée"}
          </h1>
          <p className="text-gray-500 text-sm mb-6">{msg}</p>
          <a href="/connexion" className="text-sm text-blue-600 hover:underline">Se connecter</a>
        </div>
      </div>
    );
  }

  // ── Succès ──
  if (accepted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-violet-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Bienvenue dans l'équipe !</h1>
          <p className="text-gray-500 text-sm">Redirection vers votre tableau de bord…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-violet-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-md">

        {/* Header */}
        <div className="p-8 pb-0 text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-violet-500 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Users className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Invitation à rejoindre une équipe</h1>
          <p className="text-sm text-gray-500">
            {invitation?.owner_full_name
              ? <><span className="font-semibold text-gray-700">{invitation.owner_full_name}</span> vous invite sur SEO Alert Scan</>
              : "Vous avez été invité à rejoindre un espace SEO Alert Scan"}
          </p>
        </div>

        {/* Infos invitation */}
        <div className="mx-8 my-5 bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Email</span>
            <span className="font-medium text-gray-800">{invitation?.email}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Rôle</span>
            <span className={`font-semibold ${invitation?.role === "editor" ? "text-blue-600" : "text-gray-600"}`}>
              {roleLabel} {invitation?.role === "editor" ? "— accès complet" : "— lecture seule"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Expire le</span>
            <span className="font-medium text-gray-800">
              {invitation && new Date(invitation.expires_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
            </span>
          </div>
        </div>

        <div className="px-8 pb-8">
          {authError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {authError}
            </div>
          )}

          {/* Si déjà connecté */}
          {loggedIn ? (
            wrongAccount ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  <p className="font-semibold mb-1">Mauvais compte connecté</p>
                  <p>
                    Vous êtes connecté avec <span className="font-mono font-semibold">{currentUserEmail}</span>, mais cette invitation est pour <span className="font-mono font-semibold">{invitation?.email}</span>.
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors">
                  Se déconnecter et utiliser le bon compte
                </button>
              </div>
            ) : (
              <button
                onClick={() => acceptInvitation()}
                disabled={accepting}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors">
                {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {accepting ? "Acceptation…" : "Accepter l'invitation"}
              </button>
            )
          ) : (
            <>
              {/* Tabs */}
              <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
                <button onClick={() => { setAuthMode("login"); setAuthError(""); }}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${authMode === "login" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                  J'ai déjà un compte
                </button>
                <button onClick={() => { setAuthMode("register"); setAuthError(""); }}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${authMode === "register" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                  Créer un compte
                </button>
              </div>

              {/* Login form */}
              {authMode === "login" && (
                <form onSubmit={handleLogin} className="space-y-3">
                  <input
                    type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                    placeholder="Email" required
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"} value={loginPwd} onChange={e => setLoginPwd(e.target.value)}
                      placeholder="Mot de passe" required
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10" />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button type="submit" disabled={authLoading}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                    {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {authLoading ? "Connexion…" : "Se connecter et rejoindre"}
                  </button>
                </form>
              )}

              {/* Register form */}
              {authMode === "register" && (
                <form onSubmit={handleRegister} className="space-y-3">
                  <input
                    type="text" value={regName} onChange={e => setRegName(e.target.value)}
                    placeholder="Nom complet" required
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input
                    type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                    placeholder="Email" required
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"} value={regPwd} onChange={e => setRegPwd(e.target.value)}
                      placeholder="Créer un mot de passe" required minLength={8}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10" />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button type="submit" disabled={authLoading}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                    {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {authLoading ? "Création…" : "Créer mon compte et rejoindre"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
