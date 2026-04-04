"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import Link from "next/link";
import {
  Globe,
  Users,
  Activity,
  Plus,
  UserPlus,
  CheckCircle,
  AlertCircle,
  Building2,
} from "lucide-react";

interface Website {
  id: number;
  domain: string;
  display_name: string | null;
  is_active: boolean;
  health_score: number | null;
  created_at: string;
}

interface TeamMember {
  id: number;
  member_id: number;
  member_email: string;
  member_full_name: string | null;
  role: string;
  created_at: string;
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function HealthBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-gray-400 text-xs">—</span>;
  const color =
    score >= 80 ? "bg-green-100 text-green-700" :
    score >= 50 ? "bg-yellow-100 text-yellow-700" :
    "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {score}/100
    </span>
  );
}

export default function AgencePage() {
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/auth/me")).data,
    staleTime: 60_000,
  });

  const { data: websites = [], isLoading: sitesLoading } = useQuery<Website[]>({
    queryKey: ["websites"],
    queryFn: async () => (await api.get("/websites")).data,
    enabled: me?.plan === "agency",
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: async () => (await api.get("/team")).data,
    enabled: me?.plan === "agency",
  });

  if (!me) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1">
          <TopNav title="Vue Agence" />
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
          <TopNav title="Vue Agence" />
          <main className="p-6">
            <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
              <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-violet-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Vue Agence</h2>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Cette fonctionnalité est réservée au plan Agence.
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

  const activeSites = websites.filter((w) => w.is_active).length;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <TopNav title="Vue Agence" />
        <main className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Building2 className="w-6 h-6 text-violet-600" />
                Vue Agence
              </h1>
              <p className="text-gray-500 mt-1">Vue d'ensemble de votre espace agence</p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/sites"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Ajouter un site
              </Link>
              <Link
                href="/equipe"
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Inviter un membre
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Sites au total"
              value={websites.length}
              icon={Globe}
              color="bg-blue-100 text-blue-600"
            />
            <StatCard
              label="Membres d'équipe"
              value={members.length}
              icon={Users}
              color="bg-violet-100 text-violet-600"
            />
            <StatCard
              label="Sites actifs"
              value={activeSites}
              icon={CheckCircle}
              color="bg-green-100 text-green-600"
            />
            <StatCard
              label="Plan"
              value="Agence"
              icon={Building2}
              color="bg-orange-100 text-orange-600"
            />
          </div>

          {/* Sites overview */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Sites Web ({websites.length})</h2>
              <Link href="/sites" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Gérer les sites →
              </Link>
            </div>
            {sitesLoading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Chargement...</div>
            ) : websites.length === 0 ? (
              <div className="p-12 text-center">
                <Globe className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Aucun site pour l'instant</p>
                <Link
                  href="/sites"
                  className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter un premier site
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-50">
                      <th className="px-6 py-3 font-medium">Site</th>
                      <th className="px-6 py-3 font-medium">Statut</th>
                      <th className="px-6 py-3 font-medium">Score santé</th>
                      <th className="px-6 py-3 font-medium">Ajouté le</th>
                      <th className="px-6 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {websites.map((site) => (
                      <tr key={site.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                              <Globe className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {site.display_name || site.domain}
                              </p>
                              <p className="text-xs text-gray-400">{site.domain}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {site.is_active ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                              <CheckCircle className="w-3 h-3" />
                              Actif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                              <AlertCircle className="w-3 h-3" />
                              Inactif
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <HealthBadge score={site.health_score} />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(site.created_at).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="px-6 py-4">
                          <Link
                            href={`/sites/${site.id}`}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Voir →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Team overview */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Équipe ({members.length})</h2>
              <Link href="/equipe" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Gérer l'équipe →
              </Link>
            </div>
            {membersLoading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Chargement...</div>
            ) : members.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Aucun membre d'équipe</p>
                <Link
                  href="/equipe"
                  className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Inviter un collaborateur
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {members.map((member) => (
                  <div key={member.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-violet-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {(member.member_full_name || member.member_email).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {member.member_full_name || member.member_email}
                      </p>
                      <p className="text-xs text-gray-500">{member.member_email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        member.role === "editor"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {member.role === "editor" ? "Éditeur" : "Lecteur"}
                      </span>
                      <span className="text-xs text-gray-400">
                        Depuis le {new Date(member.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
