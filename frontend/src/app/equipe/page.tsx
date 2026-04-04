"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { Users, Plus, Trash2, Edit2, Copy, Check, X, Mail, Shield, Eye } from "lucide-react";

interface TeamMember {
  id: number;
  member_id: number;
  owner_id: number;
  role: string;
  created_at: string;
  member_email: string;
  member_full_name: string | null;
}

interface Invitation {
  id: number;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

function RoleBadge({ role }: { role: string }) {
  if (role === "editor") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <Edit2 className="w-3 h-3" />
        Éditeur
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      <Eye className="w-3 h-3" />
      Lecteur
    </span>
  );
}

export default function EquipePage() {
  const queryClient = useQueryClient();
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editingRole, setEditingRole] = useState("editor");

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/auth/me")).data,
    staleTime: 60_000,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: async () => (await api.get("/team")).data,
    enabled: me?.plan === "agency",
  });

  const { data: invitations = [], isLoading: invitationsLoading } = useQuery<Invitation[]>({
    queryKey: ["team-invitations"],
    queryFn: async () => (await api.get("/team/invitations")).data,
    enabled: me?.plan === "agency",
  });

  const inviteMutation = useMutation({
    mutationFn: async () => (await api.post("/team/invite", { email: inviteEmail, role: inviteRole })).data,
    onSuccess: (data) => {
      setInviteLink(data.invite_link);
      setInviteEmail("");
      setInviteError(null);
      queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d: any) => d?.msg || JSON.stringify(d)).join(", ")
        : typeof detail === "string" ? detail : "Erreur lors de l'invitation.";
      setInviteError(msg);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: number) => (await api.delete(`/team/members/${memberId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-members"] }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: number; role: string }) =>
      (await api.patch(`/team/members/${memberId}/role`, { role })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      setEditingMemberId(null);
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: number) =>
      (await api.delete(`/team/invitations/${invitationId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-invitations"] }),
  });

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!me) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1">
          <TopNav title="Mon équipe" />
          <main className="p-6">
            <div className="text-center py-12 text-gray-400">Chargement...</div>
          </main>
        </div>
      </div>
    );
  }

  if (me.plan !== "agency") {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1">
          <TopNav title="Mon équipe" />
          <main className="p-6">
            <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
              <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-violet-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Fonctionnalité Agence</h2>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                La gestion d'équipe est réservée au plan Agence. Passez à l'Agence pour inviter des collaborateurs et gérer les accès à votre espace de travail.
              </p>
              <a
                href="/abonnement"
                className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors"
              >
                Passer au plan Agence
              </a>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <TopNav title="Mon équipe" />
        <main className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mon équipe</h1>
              <p className="text-gray-500 mt-1">Gérez les accès à votre espace de travail</p>
            </div>
            <button
              onClick={() => { setShowInviteForm(!showInviteForm); setInviteLink(null); setInviteError(null); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Inviter un membre
            </button>
          </div>

          {/* Invite form */}
          {showInviteForm && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Inviter un collaborateur</h2>

              {inviteLink ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl border border-green-200">
                    <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <span className="text-sm text-green-700 font-medium">Invitation créée ! Partagez ce lien :</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={inviteLink}
                      className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-600 font-mono"
                    />
                    <button
                      onClick={() => copyLink(inviteLink)}
                      className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      {copied ? "Copié !" : "Copier"}
                    </button>
                  </div>
                  <button
                    onClick={() => { setInviteLink(null); setShowInviteForm(false); }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Fermer
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {inviteError && (
                    <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-sm text-red-700">
                      {inviteError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="collaborateur@exemple.com"
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="editor">Éditeur (accès complet sauf facturation)</option>
                        <option value="viewer">Lecteur (consultation uniquement)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => inviteMutation.mutate()}
                      disabled={!inviteEmail || inviteMutation.isPending}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {inviteMutation.isPending ? "Envoi..." : "Inviter"}
                    </button>
                    <button
                      onClick={() => setShowInviteForm(false)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Team members */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                Membres ({members.length})
              </h2>
            </div>
            {membersLoading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Chargement...</div>
            ) : members.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Aucun membre pour l'instant</p>
                <p className="text-gray-400 text-xs mt-1">Invitez des collaborateurs pour partager votre espace</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {members.map((member) => (
                  <div key={member.id} className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-violet-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {(member.member_full_name || member.member_email).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {member.member_full_name || member.member_email}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{member.member_email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {editingMemberId === member.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={editingRole}
                            onChange={(e) => setEditingRole(e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                          >
                            <option value="editor">Éditeur</option>
                            <option value="viewer">Lecteur</option>
                          </select>
                          <button
                            onClick={() => updateRoleMutation.mutate({ memberId: member.id, role: editingRole })}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingMemberId(null)}
                            className="p-1 text-gray-400 hover:bg-gray-50 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <RoleBadge role={member.role} />
                          <span className="text-xs text-gray-400">
                            Ajouté le {new Date(member.created_at).toLocaleDateString("fr-FR")}
                          </span>
                          <button
                            onClick={() => { setEditingMemberId(member.id); setEditingRole(member.role); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Modifier le rôle"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { if (confirm("Retirer ce membre ?")) removeMemberMutation.mutate(member.id); }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Retirer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending invitations */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                Invitations en attente ({invitations.length})
              </h2>
            </div>
            {invitationsLoading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Chargement...</div>
            ) : invitations.length === 0 ? (
              <div className="p-8 text-center">
                <Mail className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Aucune invitation en attente</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {invitations.map((inv) => (
                  <div key={inv.id} className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{inv.email}</p>
                      <p className="text-xs text-gray-500">
                        Expire le {new Date(inv.expires_at).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <RoleBadge role={inv.role} />
                      <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">En attente</span>
                      <button
                        onClick={() => { if (confirm("Annuler cette invitation ?")) cancelInvitationMutation.mutate(inv.id); }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Annuler l'invitation"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Role legend */}
          <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              À propos des rôles
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-blue-800">Éditeur :</span>
                <span className="text-blue-700 ml-1">Accès complet à tous les sites et données, sauf la facturation et la gestion d'équipe.</span>
              </div>
              <div>
                <span className="font-medium text-blue-800">Lecteur :</span>
                <span className="text-blue-700 ml-1">Consultation uniquement. Ne peut pas modifier les sites, lancer des scans ou faire des changements.</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
