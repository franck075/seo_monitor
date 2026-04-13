"use client";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import dynamic from "next/dynamic";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });
import {
  Users, Globe, TrendingUp, Check, X, Trash2, ChevronDown,
  MessageCircle, Send, Loader2, ShieldCheck, ShieldOff,
  Megaphone, FileText, Settings, Image, Plus, Edit2, Eye, Save,
  LayoutDashboard, Shield,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────
const PLANS = ["starter", "pro", "agency"];
const PLAN_LABELS: Record<string, string> = { starter: "Starter", pro: "Pro", agency: "Agence" };
const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-600",
  pro: "bg-blue-100 text-blue-700",
  agency: "bg-violet-100 text-violet-700",
};
const ANNOUNCEMENT_TYPES = ["info", "success", "warning", "offer"];
const ANNOUNCEMENT_TYPE_COLORS: Record<string, string> = {
  info: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  offer: "bg-violet-100 text-violet-700",
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface UserRow {
  id: number; email: string; full_name?: string; role: string;
  plan: string; is_active: boolean; site_count: number;
  created_at: string; notes?: string;
}
interface Stats {
  total_users: number; active_users: number; total_sites: number;
  plans: Record<string, number>;
}
interface SupportConv {
  conversation_id: number; user_email: string; user_name?: string;
  is_resolved: boolean; unread_admin: number; last_message?: string; last_message_at?: string;
}
interface SupportMsg {
  id: number; sender_role: "user" | "admin"; content: string; created_at: string;
}
interface SupportDetail {
  conversation_id: number; user_email: string; user_name?: string;
  is_resolved: boolean; messages: SupportMsg[];
}
interface AdminUser {
  id: number; email: string; full_name?: string; role: string; created_at: string;
}
interface Announcement {
  id: number; title: string; content: string; type: string;
  image_url?: string; video_url?: string;
  is_active: boolean; starts_at?: string; ends_at?: string;
  created_at: string; updated_at?: string;
}
interface BlogPostRow {
  id: number; slug: string; title: string; status: string;
  published_at?: string; created_at: string;
}
interface BlogPostFull extends BlogPostRow {
  excerpt?: string; content: string; cover_image?: string;
  meta_title?: string; meta_description?: string; canonical_url?: string;
  structured_data?: Record<string, unknown>; tags?: string[]; author?: string;
  updated_at?: string;
}
interface ClientLogo {
  id: number; name: string; logo_url: string; website_url?: string;
  position: number; is_active: boolean; created_at: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function slugify(str: string) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
}

// ── Support Panel ─────────────────────────────────────────────────────────────
function SupportPanel() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: convs, isLoading } = useQuery<SupportConv[]>({
    queryKey: ["admin-support-convs"],
    queryFn: async () => (await api.get("/support/admin/conversations")).data,
    refetchInterval: 10000,
  });
  const { data: detail, isLoading: detailLoading } = useQuery<SupportDetail>({
    queryKey: ["admin-support-detail", selectedId],
    queryFn: async () => (await api.get(`/support/admin/conversations/${selectedId}`)).data,
    enabled: !!selectedId,
    refetchInterval: 5000,
  });
  const replyMutation = useMutation({
    mutationFn: async (content: string) =>
      (await api.post(`/support/admin/conversations/${selectedId}/reply`, { content })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-support-detail", selectedId] });
      qc.invalidateQueries({ queryKey: ["admin-support-convs"] });
      setReply("");
    },
  });
  const resolveMutation = useMutation({
    mutationFn: async (id: number) =>
      (await api.put(`/support/admin/conversations/${id}/resolve`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-support-convs"] });
      qc.invalidateQueries({ queryKey: ["admin-support-detail", selectedId] });
    },
  });
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" style={{ height: "580px", display: "flex" }}>
      <div className="w-72 flex-shrink-0 border-r border-gray-100 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="font-semibold text-gray-900 text-sm">Conversations</h2>
          <p className="text-xs text-gray-400">{convs?.length || 0} au total</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>
          ) : !convs?.length ? (
            <div className="text-center py-12 text-gray-400 text-sm">Aucune conversation</div>
          ) : (
            convs.map(conv => (
              <button key={conv.conversation_id} onClick={() => setSelectedId(conv.conversation_id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selectedId === conv.conversation_id ? "bg-blue-50" : ""}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-sm font-medium text-gray-900 truncate">{conv.user_name || conv.user_email}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {conv.unread_admin > 0 && (
                      <span className="w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{conv.unread_admin}</span>
                    )}
                    {conv.is_resolved && <span className="text-xs text-green-500">✓</span>}
                  </div>
                </div>
                <p className="text-xs text-gray-400 truncate">{conv.last_message || "—"}</p>
              </button>
            ))
          )}
        </div>
      </div>
      {!selectedId ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
          <MessageCircle className="w-12 h-12 mb-3" />
          <p className="text-sm">Sélectionnez une conversation</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{detail?.user_name || detail?.user_email || "…"}</p>
              <p className="text-xs text-gray-400">{detail?.user_email}</p>
            </div>
            <button onClick={() => resolveMutation.mutate(selectedId)} disabled={resolveMutation.isPending}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${detail?.is_resolved ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              {detail?.is_resolved ? "✓ Résolu" : "Marquer résolu"}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {detailLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>
            ) : (
              detail?.messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender_role === "admin" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${msg.sender_role === "admin" ? "bg-blue-600 text-white rounded-br-sm" : "bg-white border border-gray-100 text-gray-700 rounded-bl-sm shadow-sm"}`}>
                    <p>{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.sender_role === "admin" ? "text-blue-200" : "text-gray-400"}`}>{formatTime(msg.created_at)}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
          <div className="p-3 border-t border-gray-100 bg-white">
            <div className="flex gap-2">
              <input value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && reply.trim() && replyMutation.mutate(reply.trim())}
                placeholder="Répondre…"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={() => reply.trim() && replyMutation.mutate(reply.trim())}
                disabled={!reply.trim() || replyMutation.isPending}
                className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition-colors flex-shrink-0">
                {replyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admins Tab ────────────────────────────────────────────────────────────────
function AdminsTab({ currentUserId }: { currentUserId?: number }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [showForm, setShowForm] = useState(false);

  const { data: admins, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-admins"],
    queryFn: async () => (await api.get("/admin/admins")).data,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => (await api.post("/admin/admins", data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-admins"] });
      setForm({ email: "", password: "", full_name: "" });
      setShowForm(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/admins/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-admins"] }),
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Administrateurs</h2>
            <p className="text-xs text-gray-400 mt-0.5">{admins?.length || 0} admins</p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />Nouvel admin
          </button>
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b border-gray-50 bg-blue-50/30">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Créer un administrateur</h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="Email" type="email"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="Nom complet"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="Mot de passe" type="password"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.email || !form.password}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {createMutation.isPending ? "Création…" : "Créer"}
              </button>
            </div>
            {createMutation.isError && (
              <p className="text-xs text-red-500 mt-2">Erreur lors de la création</p>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Administrateur</th>
                <th className="text-left px-4 py-3">Inscrit le</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {admins?.map(admin => (
                <tr key={admin.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{admin.full_name || "—"}</p>
                    <p className="text-xs text-gray-400">{admin.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(admin.created_at).toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-3 text-right">
                    {admin.id !== currentUserId && (
                      <button onClick={() => removeMutation.mutate(admin.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Video embed URL converter ──────────────────────────────────────────────────
function toEmbedUrl(url: string): string | null {
  if (!url) return null;
  // YouTube watch
  const ytWatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}`;
  // YouTube shorts
  const ytShort = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;
  // Vimeo
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  // Already an embed URL
  if (url.includes("/embed/") || url.includes("player.vimeo")) return url;
  return null;
}

// ── Announcements Tab ─────────────────────────────────────────────────────────
function AnnouncementsTab() {
  const qc = useQueryClient();
  const emptyForm = { title: "", content: "", type: "info", image_url: "", video_url: "", is_active: true, starts_at: "", ends_at: "" };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const { data: announcements, isLoading } = useQuery<Announcement[]>({
    queryKey: ["admin-announcements"],
    queryFn: async () => (await api.get("/admin/announcements")).data,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = { ...data, starts_at: data.starts_at || null, ends_at: data.ends_at || null };
      return (await api.post("/admin/announcements", payload)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-announcements"] }); setForm(emptyForm); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof form }) => {
      const payload = { ...data, starts_at: data.starts_at || null, ends_at: data.ends_at || null };
      return (await api.put(`/admin/announcements/${id}`, payload)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-announcements"] }); setEditId(null); setForm(emptyForm); setShowForm(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/announcements/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-announcements"] }),
  });

  function openEdit(ann: Announcement) {
    setEditId(ann.id);
    setForm({
      title: ann.title, content: ann.content, type: ann.type,
      image_url: ann.image_url || "",
      video_url: ann.video_url || "",
      is_active: ann.is_active,
      starts_at: ann.starts_at ? ann.starts_at.slice(0, 16) : "",
      ends_at: ann.ends_at ? ann.ends_at.slice(0, 16) : "",
    });
    setShowForm(true);
  }

  async function handleImgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/admin/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm(p => ({ ...p, image_url: res.data.url }));
    } catch { /* ignore */ }
    finally { setImgUploading(false); if (imgInputRef.current) imgInputRef.current.value = ""; }
  }

  function handleSubmit() {
    if (editId) updateMutation.mutate({ id: editId, data: form });
    else createMutation.mutate(form);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Annonces</h2>
            <p className="text-xs text-gray-400 mt-0.5">{announcements?.length || 0} annonces</p>
          </div>
          <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyForm); }}
            className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />Nouvelle annonce
          </button>
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b border-gray-50 bg-blue-50/30 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">{editId ? "Modifier" : "Créer"} une annonce</h3>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Titre"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
              placeholder="Contenu" rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />

            {/* Image upload */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Image (optionnel)</label>
              <div className="flex items-center gap-3">
                <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImgUpload} />
                <button type="button" onClick={() => imgInputRef.current?.click()}
                  disabled={imgUploading}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors">
                  {imgUploading ? "Envoi…" : "📷 Choisir une image"}
                </button>
                <input value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))}
                  placeholder="ou coller une URL"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {form.image_url && (
                <div className="mt-2 flex items-center gap-3">
                  <img src={form.image_url} alt="aperçu" className="h-20 w-32 object-cover rounded-lg border border-gray-200" />
                  <button type="button" onClick={() => setForm(p => ({ ...p, image_url: "" }))}
                    className="text-xs text-red-500 hover:text-red-700">Supprimer</button>
                </div>
              )}
            </div>

            {/* Video URL */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Vidéo (optionnel — YouTube, Vimeo…)</label>
              <input
                value={form.video_url}
                onChange={e => setForm(p => ({ ...p, video_url: e.target.value }))}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {form.video_url && (() => {
                const embed = toEmbedUrl(form.video_url);
                return embed ? (
                  <div className="mt-2">
                    <iframe
                      src={embed}
                      className="w-full rounded-lg border border-gray-200"
                      style={{ height: 200 }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                    <button type="button" onClick={() => setForm(p => ({ ...p, video_url: "" }))}
                      className="mt-1 text-xs text-red-500 hover:text-red-700">Supprimer la vidéo</button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-amber-600">URL non reconnue — YouTube et Vimeo supportés.</p>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {ANNOUNCEMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                  className="rounded" />
                Actif
              </label>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Début</label>
                <input type="datetime-local" value={form.starts_at} onChange={e => setForm(p => ({ ...p, starts_at: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fin</label>
                <input type="datetime-local" value={form.ends_at} onChange={e => setForm(p => ({ ...p, ends_at: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }}
                className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Annuler</button>
              <button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending || !form.title}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {(createMutation.isPending || updateMutation.isPending) ? "Sauvegarde…" : "Enregistrer"}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : !announcements?.length ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucune annonce</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {announcements.map(ann => (
              <div key={ann.id} className="px-5 py-4 flex items-start gap-4 hover:bg-gray-50">
                {ann.image_url && (
                  <img src={ann.image_url} alt={ann.title} className="w-16 h-12 object-cover rounded-lg border border-gray-100 flex-shrink-0" />
                )}
                {!ann.image_url && ann.video_url && (
                  <div className="w-16 h-12 bg-gray-100 rounded-lg border border-gray-100 flex-shrink-0 flex items-center justify-center text-gray-400 text-xl">▶</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-medium text-gray-900 text-sm">{ann.title}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ANNOUNCEMENT_TYPE_COLORS[ann.type] || "bg-gray-100 text-gray-600"}`}>{ann.type}</span>
                    {ann.video_url && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">▶ Vidéo</span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ann.is_active ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                      {ann.is_active ? "Actif" : "Inactif"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{ann.content}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(ann)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteMutation.mutate(ann.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Blog Cover Image Upload ────────────────────────────────────────────────────
function BlogCoverImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/admin/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(data.url);
    } catch {
      alert("Erreur lors de l'upload. Vérifiez le type et la taille du fichier (max 5MB).");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://… (URL de l'image)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-60 transition-colors flex-shrink-0"
        >
          {uploading ? (
            <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Image className="w-4 h-4" />
          )}
          {uploading ? "Upload…" : "Uploader"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="Aperçu" className="h-20 rounded-lg object-cover border border-gray-100" />
      )}
    </div>
  );
}

// ── Blog Tab ──────────────────────────────────────────────────────────────────
function BlogTab() {
  const qc = useQueryClient();
  const emptyForm: Omit<BlogPostFull, "id" | "created_at"> = {
    slug: "", title: "", excerpt: "", content: "", cover_image: "",
    meta_title: "", meta_description: "", canonical_url: "",
    structured_data: undefined, tags: [], author: "", status: "draft", published_at: undefined,
  };
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [tagsInput, setTagsInput] = useState("");
  const [sdInput, setSdInput] = useState("");

  const { data: posts, isLoading } = useQuery<BlogPostRow[]>({
    queryKey: ["admin-blog"],
    queryFn: async () => (await api.get("/admin/blog")).data,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => (await api.post("/admin/blog", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-blog"] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) =>
      (await api.put(`/admin/blog/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-blog"] }); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/blog/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-blog"] }),
  });

  const publishMutation = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/blog/${id}/publish`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-blog"] }),
  });

  function resetForm() { setForm(emptyForm); setTagsInput(""); setSdInput(""); setEditId(null); setShowForm(false); }

  async function openEdit(id: number) {
    const { data } = await api.get<BlogPostFull>(`/admin/blog/${id}`);
    setEditId(id);
    setForm({
      slug: data.slug, title: data.title, excerpt: data.excerpt || "",
      content: data.content, cover_image: data.cover_image || "",
      meta_title: data.meta_title || "", meta_description: data.meta_description || "",
      canonical_url: data.canonical_url || "",
      structured_data: data.structured_data,
      tags: data.tags || [], author: data.author || "",
      status: data.status, published_at: data.published_at,
    });
    setTagsInput((data.tags || []).join(", "));
    setSdInput(data.structured_data ? JSON.stringify(data.structured_data, null, 2) : "");
    setShowForm(true);
  }

  function handleTitleChange(title: string) {
    setForm(p => ({ ...p, title, slug: editId ? p.slug : slugify(title) }));
  }

  function handleSubmit() {
    let sd = form.structured_data;
    if (sdInput.trim()) {
      try { sd = JSON.parse(sdInput); } catch { sd = undefined; }
    } else { sd = undefined; }
    const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);
    const payload = { ...form, structured_data: sd, tags };
    if (editId) updateMutation.mutate({ id: editId, data: payload });
    else createMutation.mutate(payload);
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    published: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Blog</h2>
            <p className="text-xs text-gray-400 mt-0.5">{posts?.length || 0} articles</p>
          </div>
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />Nouvel article
          </button>
        </div>

        {showForm && (
          <div className="px-5 py-5 border-b border-gray-100 bg-gray-50/50 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">{editId ? "Modifier l'article" : "Créer un article"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Titre *</label>
                <input value={form.title} onChange={e => handleTitleChange(e.target.value)}
                  placeholder="Titre de l'article"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Slug *</label>
                <input value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
                  placeholder="mon-article-slug"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Extrait</label>
              <textarea value={form.excerpt} onChange={e => setForm(p => ({ ...p, excerpt: e.target.value }))}
                placeholder="Résumé court de l'article…" rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Contenu</label>
              <RichTextEditor
                content={form.content}
                onChange={(html) => setForm(p => ({ ...p, content: html }))}
                placeholder="Rédigez votre article ici…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Image de couverture</label>
                <BlogCoverImageField
                  value={form.cover_image || ""}
                  onChange={(url) => setForm(p => ({ ...p, cover_image: url }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Auteur</label>
                <input value={form.author} onChange={e => setForm(p => ({ ...p, author: e.target.value }))}
                  placeholder="Nom de l'auteur"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Meta Title</label>
                <input value={form.meta_title} onChange={e => setForm(p => ({ ...p, meta_title: e.target.value }))}
                  placeholder="Titre SEO"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Meta Description</label>
                <input value={form.meta_description} onChange={e => setForm(p => ({ ...p, meta_description: e.target.value }))}
                  placeholder="Description SEO"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">URL canonique</label>
                <input value={form.canonical_url} onChange={e => setForm(p => ({ ...p, canonical_url: e.target.value }))}
                  placeholder="https://…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tags (virgule séparés)</label>
                <input value={tagsInput} onChange={e => setTagsInput(e.target.value)}
                  placeholder="seo, marketing, google"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Structured Data (JSON-LD)</label>
              <textarea value={sdInput} onChange={e => setSdInput(e.target.value)}
                placeholder='{"@context": "https://schema.org", "@type": "Article", …}' rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono" />
            </div>
            <div className="flex gap-2">
              <button onClick={resetForm}
                className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Annuler</button>
              <button onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending || !form.title || !form.slug}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {(createMutation.isPending || updateMutation.isPending) ? "Sauvegarde…" : "Enregistrer"}
              </button>
              {editId && (
                <button onClick={() => publishMutation.mutate(editId)} disabled={publishMutation.isPending}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60">
                  {publishMutation.isPending ? "Publication…" : "Publier"}
                </button>
              )}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : !posts?.length ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucun article</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Article</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-left px-4 py-3">Publié le</th>
                <th className="text-left px-4 py-3">Créé le</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {posts.map(post => (
                <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{post.title}</p>
                    <p className="text-xs text-gray-400">/blog/{post.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[post.status] || "bg-gray-100 text-gray-600"}`}>
                      {post.status === "published" ? "Publié" : "Brouillon"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {post.published_at ? new Date(post.published_at).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(post.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {post.status !== "published" && (
                        <button onClick={() => publishMutation.mutate(post.id)}
                          className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors" title="Publier">
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => openEdit(post.id)}
                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteMutation.mutate(post.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
function SettingsTab() {
  const qc = useQueryClient();
  const [settingsTab, setSettingsTab] = useState<"seo" | "robots" | "redirects" | "scripts" | "social">("seo");
  const [robots, setRobots] = useState("");
  const [redirects, setRedirects] = useState<{ from: string; to: string; type: "301" | "302" }[]>([]);
  const [seo, setSeo] = useState({ meta_title: "", meta_description: "", structured_data: "" });
  const [social, setSocial] = useState({ linkedin: "", facebook: "", youtube: "", instagram: "", tiktok: "" });
  const [scripts, setScripts] = useState({
    head_priority: "", head: "", body: "", head_legacy: "", body_legacy: ""
  });
  const [saving, setSaving] = useState(false);

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["admin-settings"],
    queryFn: async () => (await api.get("/admin/settings")).data,
  });

  // Initialize from settings when loaded
  useEffect(() => {
    if (!settings) return;
    if (settings.robots_txt !== undefined) setRobots(settings.robots_txt || "");
    if (settings.redirects) { try { setRedirects(JSON.parse(settings.redirects)); } catch { } }
    if (settings.social) { try { setSocial(s => ({ ...s, ...JSON.parse(settings.social) })); } catch { } }
    if (settings.scripts) { try { setScripts(s => ({ ...s, ...JSON.parse(settings.scripts) })); } catch { } }
    if (settings.seo) { try { setSeo(s => ({ ...s, ...JSON.parse(settings.seo) })); } catch { } }
  }, [settings]);

  async function saveSettings(payload: Record<string, string>) {
    setSaving(true);
    try {
      await api.put("/admin/settings", payload);
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } finally {
      setSaving(false);
    }
  }

  function addRedirect() {
    setRedirects(r => [...r, { from: "", to: "", type: "301" }]);
  }
  function removeRedirect(i: number) {
    setRedirects(r => r.filter((_, idx) => idx !== i));
  }
  function updateRedirect(i: number, field: string, val: string) {
    setRedirects(r => r.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  const SETTINGS_TABS = [
    { key: "seo", label: "SEO" },
    { key: "robots", label: "Robots.txt" },
    { key: "redirects", label: "Redirections" },
    { key: "scripts", label: "Scripts" },
    { key: "social", label: "Réseaux sociaux" },
  ] as const;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h2 className="font-semibold text-gray-900">Paramètres du site</h2>
      </div>
      <div className="flex border-b border-gray-100">
        {SETTINGS_TABS.map(t => (
          <button key={t.key} onClick={() => setSettingsTab(t.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${settingsTab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {settingsTab === "seo" && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Balises SEO de la page d&apos;accueil (title, meta description, JSON-LD)</p>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Title</label>
              <input value={seo.meta_title} onChange={e => setSeo(s => ({ ...s, meta_title: e.target.value }))}
                placeholder="SEO Alert Scan — Monitoring SEO automatisé 24/7"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-400 mt-1">{seo.meta_title.length}/60 caractères</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Meta Description</label>
              <textarea value={seo.meta_description} onChange={e => setSeo(s => ({ ...s, meta_description: e.target.value }))}
                rows={3} placeholder="Surveillez vos positions Google, Core Web Vitals et uptime en temps réel. Alertes email et Telegram. Essai gratuit 7 jours."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
              <p className="text-xs text-gray-400 mt-1">{seo.meta_description.length}/160 caractères</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Données structurées JSON-LD</label>
              <textarea value={seo.structured_data} onChange={e => setSeo(s => ({ ...s, structured_data: e.target.value }))}
                rows={14} placeholder={`{\n  "@context": "https://schema.org",\n  "@type": "SoftwareApplication",\n  "name": "SEO Alert Scan",\n  "applicationCategory": "BusinessApplication",\n  "operatingSystem": "Web"\n}`}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
              <p className="text-xs text-gray-400 mt-1">Format JSON-LD valide (schema.org)</p>
            </div>
            <button onClick={() => saveSettings({ seo: JSON.stringify(seo) })} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              <Save className="w-4 h-4" />{saving ? "Sauvegarde…" : "Enregistrer"}
            </button>
          </div>
        )}

        {settingsTab === "robots" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Contenu du fichier robots.txt servi dynamiquement</p>
            <textarea value={robots} onChange={e => setRobots(e.target.value)} rows={12}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder={"User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml"} />
            <button onClick={() => saveSettings({ robots_txt: robots })} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              <Save className="w-4 h-4" />{saving ? "Sauvegarde…" : "Enregistrer"}
            </button>
          </div>
        )}

        {settingsTab === "redirects" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Gérez vos redirections HTTP</p>
            <div className="space-y-2">
              {redirects.map((r, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={r.from} onChange={e => updateRedirect(i, "from", e.target.value)}
                    placeholder="/ancienne-url" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-gray-400 text-sm">→</span>
                  <input value={r.to} onChange={e => updateRedirect(i, "to", e.target.value)}
                    placeholder="/nouvelle-url" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <select value={r.type} onChange={e => updateRedirect(i, "type", e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="301">301</option>
                    <option value="302">302</option>
                  </select>
                  <button onClick={() => removeRedirect(i)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={addRedirect} className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                <Plus className="w-4 h-4" />Ajouter
              </button>
              <button onClick={() => saveSettings({ redirects: JSON.stringify(redirects) })} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                <Save className="w-4 h-4" />{saving ? "Sauvegarde…" : "Enregistrer"}
              </button>
            </div>
          </div>
        )}

        {settingsTab === "scripts" && (
          <div className="space-y-4">
            {[
              { key: "head_priority", label: "Scripts prioritaires (haut du <head>)" },
              { key: "head", label: "Scripts head (avant </head>)" },
              { key: "body", label: "Scripts body (avant </body>)" },
              { key: "head_legacy", label: "[Legacy] Scripts head" },
              { key: "body_legacy", label: "[Legacy] Scripts body" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
                <textarea
                  value={scripts[key as keyof typeof scripts]}
                  onChange={e => setScripts(s => ({ ...s, [key]: e.target.value }))}
                  rows={4} placeholder="<script>…</script>"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
              </div>
            ))}
            <button onClick={() => saveSettings({ scripts: JSON.stringify(scripts) })} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              <Save className="w-4 h-4" />{saving ? "Sauvegarde…" : "Enregistrer"}
            </button>
          </div>
        )}

        {settingsTab === "social" && (
          <div className="space-y-4">
            {[
              { key: "linkedin", label: "LinkedIn URL", placeholder: "https://linkedin.com/company/…" },
              { key: "facebook", label: "Facebook URL", placeholder: "https://facebook.com/…" },
              { key: "youtube", label: "YouTube URL", placeholder: "https://youtube.com/@…" },
              { key: "instagram", label: "Instagram URL", placeholder: "https://instagram.com/…" },
              { key: "tiktok", label: "TikTok URL", placeholder: "https://tiktok.com/@…" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
                <input
                  value={social[key as keyof typeof social]}
                  onChange={e => setSocial(s => ({ ...s, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            <button onClick={() => saveSettings({ social: JSON.stringify(social) })} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              <Save className="w-4 h-4" />{saving ? "Sauvegarde…" : "Enregistrer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Logo Upload Field ──────────────────────────────────────────────────────────
function LogoUploadField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/admin/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(data.url);
    } catch {
      alert("Erreur lors de l'upload. Vérifiez le type et la taille du fichier (max 5MB).");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://… (URL de l'image)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-60 transition-colors flex-shrink-0"
        >
          {uploading ? (
            <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Image className="w-4 h-4" />
          )}
          {uploading ? "Upload…" : "Uploader"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      {value && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Aperçu logo" className="h-10 max-w-[120px] object-contain border border-gray-100 rounded bg-gray-50 p-1" />
          <span className="text-xs text-gray-400 truncate max-w-[180px]">{value.split("/").pop()}</span>
        </div>
      )}
    </div>
  );
}

// ── Client Logos Tab ──────────────────────────────────────────────────────────
function ClientLogosTab() {
  const qc = useQueryClient();
  const emptyForm = { name: "", logo_url: "", website_url: "", position: 0, is_active: true };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: logos, isLoading } = useQuery<ClientLogo[]>({
    queryKey: ["admin-client-logos"],
    queryFn: async () => (await api.get("/admin/client-logos")).data,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => (await api.post("/admin/client-logos", data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-client-logos"] }); setForm(emptyForm); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) =>
      (await api.put(`/admin/client-logos/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-client-logos"] }); setEditId(null); setForm(emptyForm); setShowForm(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/client-logos/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-client-logos"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => (await api.patch(`/admin/client-logos/${id}/toggle`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-client-logos"] }),
  });

  function openEdit(logo: ClientLogo) {
    setEditId(logo.id);
    setForm({ name: logo.name, logo_url: logo.logo_url, website_url: logo.website_url || "", position: logo.position, is_active: logo.is_active });
    setShowForm(true);
  }

  function handleSubmit() {
    if (editId) updateMutation.mutate({ id: editId, data: form });
    else createMutation.mutate(form);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Logos clients</h2>
            <p className="text-xs text-gray-400 mt-0.5">{logos?.length || 0} logos</p>
          </div>
          <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyForm); }}
            className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />Ajouter un logo
          </button>
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b border-gray-100 bg-blue-50/30 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">{editId ? "Modifier" : "Ajouter"} un logo</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nom *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Nom de l'entreprise"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Logo *</label>
                <LogoUploadField
                  value={form.logo_url}
                  onChange={(url) => setForm(p => ({ ...p, logo_url: url }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Site web</label>
                <input value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))}
                  placeholder="https://…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Position (ordre)</label>
                <input type="number" value={form.position} onChange={e => setForm(p => ({ ...p, position: parseInt(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="rounded" />
              Actif
            </label>
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }}
                className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Annuler</button>
              <button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending || !form.name || !form.logo_url}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {(createMutation.isPending || updateMutation.isPending) ? "Sauvegarde…" : "Enregistrer"}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : !logos?.length ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucun logo</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-5">
            {logos.map(logo => (
              <div key={logo.id} className={`border rounded-xl p-4 flex flex-col gap-2 transition-all ${logo.is_active ? "border-gray-100 bg-white" : "border-gray-100 bg-gray-50 opacity-60"}`}>
                <div className="h-16 flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden">
                  {logo.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo.logo_url} alt={logo.name} className="max-h-14 max-w-full object-contain" />
                  ) : (
                    <span className="text-gray-300 text-xs">No image</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 truncate">{logo.name}</p>
                  <p className="text-xs text-gray-400">Pos: {logo.position}</p>
                </div>
                <div className="flex items-center gap-1 mt-auto">
                  <button onClick={() => toggleMutation.mutate(logo.id)}
                    className={`flex-1 text-xs py-1 rounded-lg transition-colors ${logo.is_active ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    {logo.is_active ? "Actif" : "Inactif"}
                  </button>
                  <button onClick={() => openEdit(logo)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteMutation.mutate(logo.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
type Tab = "dashboard" | "users" | "admins" | "announcements" | "blog" | "settings" | "logos" | "support";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [notes, setNotes] = useState("");

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/auth/me")).data,
    retry: false,
  });

  useEffect(() => {
    if (me && me.role !== "admin") router.replace("/tableau-de-bord");
  }, [me, router]);

  const { data: stats } = useQuery<Stats>({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get("/admin/stats")).data,
  });

  const { data: users, isLoading } = useQuery<UserRow[]>({
    queryKey: ["admin-users"],
    queryFn: async () => (await api.get("/admin/users")).data,
  });

  const planMutation = useMutation({
    mutationFn: async ({ id, plan, notes }: { id: number; plan: string; notes: string }) =>
      api.put(`/admin/users/${id}/plan`, { plan, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      setEditUser(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => api.put(`/admin/users/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async (id: number) => api.put(`/admin/users/${id}/role`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  function openEdit(user: UserRow) {
    setEditUser(user);
    setSelectedPlan(user.plan || "starter");
    setNotes(user.notes || "");
  }

  const statCards = [
    { label: "Utilisateurs totaux", value: stats?.total_users ?? "—", icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Comptes actifs", value: stats?.active_users ?? "—", icon: Check, color: "text-green-600", bg: "bg-green-50" },
    { label: "Sites monitorés", value: stats?.total_sites ?? "—", icon: Globe, color: "text-violet-600", bg: "bg-violet-50" },
    { label: "Comptes Pro+", value: stats ? (stats.plans.pro || 0) + (stats.plans.agency || 0) : "—", icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50" },
  ];

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { key: "users", label: "Utilisateurs", icon: Users },
    { key: "admins", label: "Admins", icon: Shield },
    { key: "support", label: "Support", icon: MessageCircle },
    { key: "announcements", label: "Annonces", icon: Megaphone },
    { key: "blog", label: "Blog", icon: FileText },
    { key: "settings", label: "Paramètres", icon: Settings },
    { key: "logos", label: "Logos clients", icon: Image },
  ];

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopNav title="Administration" />
        <main className="p-6 space-y-6">

          {/* Tab navigation */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>

          {/* Dashboard */}
          {activeTab === "dashboard" && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              {stats && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="font-semibold text-gray-900 mb-4">Répartition des plans</h3>
                  <div className="flex gap-4">
                    {PLANS.map(p => (
                      <div key={p} className="flex-1 text-center">
                        <p className="text-2xl font-bold text-gray-900">{stats.plans[p] || 0}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_COLORS[p]}`}>{PLAN_LABELS[p]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Users */}
          {activeTab === "users" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-semibold text-gray-900">Utilisateurs</h2>
                <p className="text-xs text-gray-400 mt-0.5">{users?.length || 0} comptes enregistrés</p>
              </div>
              {isLoading ? (
                <div className="p-8 text-center text-gray-400">Chargement...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-5 py-3">Utilisateur</th>
                        <th className="text-left px-4 py-3">Rôle</th>
                        <th className="text-left px-4 py-3">Plan</th>
                        <th className="text-left px-4 py-3">Sites</th>
                        <th className="text-left px-4 py-3">Statut</th>
                        <th className="text-left px-4 py-3">Inscrit le</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {users?.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-900">{user.full_name || "—"}</p>
                            <p className="text-xs text-gray-400">{user.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${user.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500"}`}>
                              {user.role === "admin" ? <><ShieldCheck className="w-3 h-3" />Admin</> : "User"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => openEdit(user)}
                              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${PLAN_COLORS[user.plan] || PLAN_COLORS.starter} hover:opacity-80 transition-opacity`}>
                              {PLAN_LABELS[user.plan] || user.plan}
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{user.site_count}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${user.is_active ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                              {user.is_active ? "Actif" : "Suspendu"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {new Date(user.created_at).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 justify-end">
                              {user.id !== me?.id && (
                                <button onClick={() => roleMutation.mutate(user.id)}
                                  title={user.role === "admin" ? "Retirer admin" : "Passer admin"}
                                  className={`p-1.5 rounded-lg transition-colors ${user.role === "admin" ? "text-violet-400 hover:text-violet-600 hover:bg-violet-50" : "text-gray-300 hover:text-violet-500 hover:bg-violet-50"}`}>
                                  {user.role === "admin" ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                                </button>
                              )}
                              <button onClick={() => toggleMutation.mutate(user.id)}
                                title={user.is_active ? "Suspendre" : "Réactiver"}
                                className={`p-1.5 rounded-lg transition-colors ${user.is_active ? "text-gray-400 hover:text-amber-500 hover:bg-amber-50" : "text-gray-400 hover:text-green-500 hover:bg-green-50"}`}>
                                {user.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                              </button>
                              <button onClick={() => deleteMutation.mutate(user.id)} title="Supprimer"
                                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "admins" && <AdminsTab currentUserId={me?.id} />}
          {activeTab === "support" && <SupportPanel />}
          {activeTab === "announcements" && <AnnouncementsTab />}
          {activeTab === "blog" && <BlogTab />}
          {activeTab === "settings" && <SettingsTab />}
          {activeTab === "logos" && <ClientLogosTab />}

        </main>
      </div>

      {/* Edit plan modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-blue-600">
                {(editUser.full_name || editUser.email).charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{editUser.full_name || editUser.email}</p>
                <p className="text-xs text-gray-400">{editUser.email}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Plan</label>
              <div className="flex gap-2">
                {PLANS.map(p => (
                  <button key={p} onClick={() => setSelectedPlan(p)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${selectedPlan === p ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:border-blue-300"}`}>
                    {PLAN_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes internes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Paiement reçu, contrat signé..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditUser(null)}
                className="flex-1 border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={() => planMutation.mutate({ id: editUser.id, plan: selectedPlan, notes })}
                disabled={planMutation.isPending}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                {planMutation.isPending ? "Sauvegarde…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
