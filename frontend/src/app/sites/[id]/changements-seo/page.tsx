"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import Link from "next/link";
import {
  Plus, Trash2, RefreshCw, Bell, X, Check, ChevronDown, ChevronUp,
  AlertTriangle, Tag, Eye, Clock, Layers, Globe,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type SEOMonitor = {
  id: number;
  url: string;
  label: string;
  is_active: boolean;
  check_frequency: string;
  last_checked_at: string | null;
  created_at: string;
  changes_count: number;
  channels: string[];
  track_title: boolean;
  track_meta_desc: boolean;
  track_h1: boolean;
  track_h2: boolean;
  track_h3: boolean;
  track_canonical: boolean;
  track_robots: boolean;
  track_og: boolean;
  track_schema: boolean;
  track_hreflang: boolean;
  track_links_count: boolean;
  track_alt_text: boolean;
  track_full_html: boolean;
};

type SEOChange = {
  id: number;
  page_url: string;
  detected_at: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
};

type Snapshot = {
  recorded_at: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  h2s: string[] | null;
  h3s: string[] | null;
  canonical: string | null;
  robots_meta: string | null;
  og_title: string | null;
  og_description: string | null;
  schema_types: string[] | null;
  hreflang: string[] | null;
  links_count: number | null;
  images_without_alt: number | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  title: "Balise Title",
  meta_description: "Meta Description",
  h1: "Titre H1",
  h2s: "Titres H2",
  h3s: "Titres H3",
  canonical: "URL Canonique",
  robots_meta: "Meta Robots",
  og_title: "OG Title",
  og_description: "OG Description",
  schema_types: "Schema Markup",
  hreflang: "Hreflang",
  links_count: "Nb Liens",
  images_without_alt: "Images sans Alt",
};

const SEVERITY: Record<string, { label: string; cls: string; dot: string }> = {
  title: { label: "Critique", cls: "bg-red-100 text-red-700", dot: "bg-red-500" },
  meta_description: { label: "Important", cls: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  h1: { label: "Important", cls: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  h2s: { label: "Mineur", cls: "bg-blue-100 text-blue-700", dot: "bg-blue-400" },
  h3s: { label: "Mineur", cls: "bg-blue-100 text-blue-700", dot: "bg-blue-400" },
  canonical: { label: "Critique", cls: "bg-red-100 text-red-700", dot: "bg-red-500" },
  robots_meta: { label: "Critique", cls: "bg-red-100 text-red-700", dot: "bg-red-500" },
  og_title: { label: "Mineur", cls: "bg-blue-100 text-blue-700", dot: "bg-blue-400" },
  og_description: { label: "Mineur", cls: "bg-blue-100 text-blue-700", dot: "bg-blue-400" },
  schema_types: { label: "Important", cls: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  hreflang: { label: "Important", cls: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  links_count: { label: "Mineur", cls: "bg-blue-100 text-blue-700", dot: "bg-blue-400" },
  images_without_alt: { label: "Mineur", cls: "bg-blue-100 text-blue-700", dot: "bg-blue-400" },
};

const TRACK_OPTIONS = [
  {
    group: "Éléments SEO essentiels",
    items: [
      { key: "track_title", label: "Balise Title", desc: "Titre affiché dans les SERP" },
      { key: "track_meta_desc", label: "Meta Description", desc: "Description dans les résultats de recherche" },
      { key: "track_h1", label: "H1", desc: "Titre principal de la page" },
      { key: "track_canonical", label: "URL Canonique", desc: "Balise <link rel=canonical>" },
      { key: "track_robots", label: "Meta Robots", desc: "Directives noindex, nofollow…" },
      { key: "track_schema", label: "Schema Markup", desc: "Types de données structurées (JSON-LD)" },
    ],
  },
  {
    group: "Éléments supplémentaires",
    items: [
      { key: "track_h2", label: "Titres H2", desc: "Les 10 premiers H2" },
      { key: "track_h3", label: "Titres H3", desc: "Les 10 premiers H3" },
      { key: "track_og", label: "Open Graph", desc: "og:title et og:description" },
      { key: "track_hreflang", label: "Hreflang", desc: "Balises de langue/région" },
    ],
  },
  {
    group: "Format de page",
    items: [
      { key: "track_links_count", label: "Nombre de liens", desc: "Nombre total de liens <a>" },
      { key: "track_alt_text", label: "Images sans Alt", desc: "Images manquant l'attribut alt" },
      { key: "track_full_html", label: "HTML complet", desc: "Diff complet du contenu HTML" },
    ],
  },
];

// ── Add Monitor Modal ─────────────────────────────────────────────────────────

function AddMonitorModal({
  websiteId, domain, onClose,
}: { websiteId: string; domain?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [urlsText, setUrlsText] = useState(`https://${domain ?? ""}`);
  const [frequency, setFrequency] = useState("daily");
  const [channels, setChannels] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [tracks, setTracks] = useState<Record<string, boolean>>({
    track_title: true,
    track_meta_desc: true,
    track_h1: true,
    track_h2: false,
    track_h3: false,
    track_canonical: true,
    track_robots: true,
    track_og: false,
    track_schema: true,
    track_hreflang: false,
    track_links_count: false,
    track_alt_text: false,
    track_full_html: false,
  });

  const toggle = (key: string) => setTracks((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleChannel = (ch: string) =>
    setChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);

  const mutation = useMutation({
    mutationFn: async () => {
      const urls = urlsText.split("\n").map((u) => u.trim()).filter(Boolean);
      await api.post(`/websites/${websiteId}/seo-changes/monitors`, {
        urls,
        check_frequency: frequency,
        channels,
        ...tracks,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["seo-monitors", websiteId] }); onClose(); },
    onError: (e: { response?: { data?: { detail?: string } } }) => setError(e?.response?.data?.detail ?? "Erreur"),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Configurer un moniteur SEO</h2>
            <p className="text-xs text-gray-400 mt-0.5">Saisissez les pages à surveiller et choisissez les éléments à suivre</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* URLs */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              URL(s) à surveiller <span className="text-red-500">*</span>
            </label>
            <textarea
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              rows={4}
              placeholder={`https://example.com\nhttps://example.com/blog\nhttps://example.com/produit`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Saisissez une URL par ligne. Plusieurs URL créeront des moniteurs distincts.</p>
          </div>

          {/* Frequency */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Fréquence de vérification</label>
            <div className="flex gap-2">
              {[
                { value: "daily", label: "Tous les jours" },
                { value: "weekly", label: "Chaque semaine" },
              ].map((f) => (
                <button key={f.value} onClick={() => setFrequency(f.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${frequency === f.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                  <Clock className="w-3.5 h-3.5" />
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Alertes en cas de changement</label>
            <div className="flex gap-2">
              {[
                { value: "email", label: "Email", icon: "✉️", desc: "Notification par email" },
                { value: "telegram", label: "Telegram", icon: "✈️", desc: "Message Telegram" },
              ].map((ch) => {
                const active = channels.includes(ch.value);
                return (
                  <button key={ch.value} type="button" onClick={() => toggleChannel(ch.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${active ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${active ? "bg-green-600" : "bg-gray-200"}`}>
                      {active && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span>{ch.icon} {ch.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Recevez une alerte dès qu'un changement est détecté. Configurez vos coordonnées dans{" "}
              <a href="/settings/notifications" className="text-blue-500 hover:underline">Paramètres → Notifications</a>.
            </p>
          </div>

          {/* Tracking options */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-3">Éléments à surveiller</label>
            <div className="space-y-4">
              {TRACK_OPTIONS.map((group) => (
                <div key={group.group}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{group.group}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => (
                      <button key={item.key} onClick={() => toggle(item.key)}
                        className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors ${tracks[item.key] ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                        <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${tracks[item.key] ? "bg-blue-600" : "bg-gray-200"}`}>
                          {tracks[item.key] && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-800">{item.label}</p>
                          <p className="text-xs text-gray-400">{item.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg border border-gray-200">Annuler</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !urlsText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Plus className="w-4 h-4" />
            {mutation.isPending ? "Création…" : "Créer le moniteur"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Monitor Card ──────────────────────────────────────────────────────────────

function MonitorCard({
  monitor, websiteId, onDelete,
}: { monitor: SEOMonitor; websiteId: string; onDelete: () => void }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: changes = [] } = useQuery<SEOChange[]>({
    queryKey: ["seo-changes", websiteId, monitor.url],
    queryFn: async () => (await api.get(`/websites/${websiteId}/seo-changes?page_url=${encodeURIComponent(monitor.url)}&limit=20`)).data,
    enabled: expanded,
  });

  const { data: snapshot } = useQuery<Snapshot | null>({
    queryKey: ["seo-snapshot", websiteId, monitor.url],
    queryFn: async () => (await api.get(`/websites/${websiteId}/seo-changes/snapshot?page_url=${encodeURIComponent(monitor.url)}`)).data,
    enabled: expanded,
  });

  const checkMutation = useMutation({
    mutationFn: async () => api.post(`/websites/${websiteId}/seo-changes/monitors/${monitor.id}/check`),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["seo-monitors", websiteId] });
        qc.invalidateQueries({ queryKey: ["seo-changes", websiteId, monitor.url] });
        qc.invalidateQueries({ queryKey: ["seo-snapshot", websiteId, monitor.url] });
      }, 5000);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async () => api.put(`/websites/${websiteId}/seo-changes/monitors/${monitor.id}`, { is_active: !monitor.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seo-monitors", websiteId] }),
  });

  const channelMutation = useMutation({
    mutationFn: async (channels: string[]) =>
      api.put(`/websites/${websiteId}/seo-changes/monitors/${monitor.id}`, { channels }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seo-monitors", websiteId] }),
  });

  const toggleChannel = (ch: string) => {
    const current = monitor.channels ?? [];
    const next = current.includes(ch) ? current.filter((c) => c !== ch) : [...current, ch];
    channelMutation.mutate(next);
  };

  const activeTracked = TRACK_OPTIONS.flatMap((g) => g.items).filter((i) => monitor[i.key as keyof SEOMonitor]);

  return (
    <div className={`bg-white rounded-xl border-2 transition-shadow hover:shadow-md ${monitor.is_active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <p className="font-semibold text-gray-900 truncate" title={monitor.label}>{monitor.label}</p>
              {monitor.changes_count > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                  {monitor.changes_count}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 truncate ml-6" title={monitor.url}>
              {monitor.url.replace(/^https?:\/\//, "")}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}
              title="Vérifier maintenant"
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <RefreshCw className={`w-4 h-4 ${checkMutation.isPending ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => toggleMutation.mutate()}
              title={monitor.is_active ? "Désactiver" : "Activer"}
              className={`w-9 h-5 rounded-full relative transition-colors ${monitor.is_active ? "bg-blue-600" : "bg-gray-200"}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${monitor.is_active ? "translate-x-4" : ""}`} />
            </button>
            <button onClick={onDelete} title="Supprimer"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-3 text-xs text-gray-400 flex-wrap">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {monitor.check_frequency === "daily" ? "Quotidien" : "Hebdo"}
          </span>
          {monitor.last_checked_at ? (
            <span>Vérifié {new Date(monitor.last_checked_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          ) : (
            <span className="text-orange-500">En attente de la 1ère vérification</span>
          )}
        </div>

        {/* Notification toggles */}
        <div className="flex items-center gap-2 mt-3">
          <Bell className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-400 mr-1">Alertes :</span>
          {[
            { value: "email", label: "✉️ Email" },
            { value: "telegram", label: "✈️ Telegram" },
          ].map((ch) => {
            const active = (monitor.channels ?? []).includes(ch.value);
            return (
              <button
                key={ch.value}
                onClick={() => toggleChannel(ch.value)}
                disabled={channelMutation.isPending}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? "bg-green-50 border-green-400 text-green-700"
                    : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"
                }`}
              >
                {ch.label}
                {active && <span className="ml-0.5 text-green-500">✓</span>}
              </button>
            );
          })}
          {channelMutation.isPending && <span className="text-xs text-gray-400">…</span>}
        </div>

        {/* Tracked elements pills */}
        <div className="flex flex-wrap gap-1 mt-3">
          {activeTracked.slice(0, 6).map((item) => (
            <span key={item.key} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">{item.label}</span>
          ))}
          {activeTracked.length > 6 && (
            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 text-xs">+{activeTracked.length - 6}</span>
          )}
        </div>
      </div>

      {/* Expand button */}
      <button onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-center gap-1 py-2 border-t border-gray-100 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors rounded-b-xl">
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {expanded ? "Masquer les détails" : `Voir ${monitor.changes_count > 0 ? `${monitor.changes_count} changement(s)` : "le snapshot"}`}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          {/* Latest snapshot */}
          {snapshot && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Dernier snapshot — {new Date(snapshot.recorded_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </h4>
              <div className="space-y-2">
                {snapshot.title && (
                  <SnapshotRow label="Title" value={snapshot.title} />
                )}
                {snapshot.meta_description && (
                  <SnapshotRow label="Description" value={snapshot.meta_description} />
                )}
                {snapshot.h1 && <SnapshotRow label="H1" value={snapshot.h1} />}
                {snapshot.canonical && <SnapshotRow label="Canonical" value={snapshot.canonical} />}
                {snapshot.robots_meta && <SnapshotRow label="Robots" value={snapshot.robots_meta} />}
                {snapshot.schema_types && snapshot.schema_types.length > 0 && (
                  <SnapshotRow label="Schema" value={snapshot.schema_types.join(", ")} />
                )}
                <div className="flex gap-4 text-xs text-gray-500 pt-1">
                  {snapshot.links_count != null && <span>{snapshot.links_count} liens</span>}
                  {snapshot.images_without_alt != null && <span>{snapshot.images_without_alt} images sans alt</span>}
                  {snapshot.hreflang && snapshot.hreflang.length > 0 && <span>{snapshot.hreflang.length} hreflang</span>}
                </div>
              </div>
            </div>
          )}
          {!snapshot && (
            <div className="text-center py-4 text-gray-400 text-xs">
              <RefreshCw className="w-5 h-5 mx-auto mb-1" />
              Aucun snapshot encore — la 1ère vérification est en cours
            </div>
          )}

          {/* Changes */}
          {changes.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-500" /> Changements détectés
              </h4>
              <div className="space-y-2">
                {changes.map((c) => (
                  <ChangeRow key={c.id} change={c} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-400 font-medium w-20 flex-shrink-0">{label}</span>
      <span className="text-gray-700 line-clamp-2">{value}</span>
    </div>
  );
}

function ChangeRow({ change }: { change: SEOChange }) {
  const [open, setOpen] = useState(false);
  const sev = SEVERITY[change.field] ?? { label: "Info", cls: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
  const fieldLabel = FIELD_LABELS[change.field] ?? change.field;

  return (
    <div className="rounded-lg border border-gray-100 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-left">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sev.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-800">{fieldLabel}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${sev.cls}`}>{sev.label}</span>
          </div>
          <span className="text-xs text-gray-400">
            {new Date(change.detected_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 grid grid-cols-2 gap-2 border-t border-gray-100">
          <div>
            <p className="text-xs font-medium text-red-600 mb-1">Avant</p>
            <p className="text-xs text-gray-700 bg-red-50 rounded p-2 font-mono whitespace-pre-wrap break-all">
              {change.old_value ?? <span className="italic text-gray-400">vide</span>}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-green-600 mb-1">Après</p>
            <p className="text-xs text-gray-700 bg-green-50 rounded p-2 font-mono whitespace-pre-wrap break-all">
              {change.new_value ?? <span className="italic text-gray-400">vide</span>}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Global changes feed ────────────────────────────────────────────────────────

function ChangesFeed({ websiteId }: { websiteId: string }) {
  const { data: changes = [] } = useQuery<SEOChange[]>({
    queryKey: ["seo-changes-all", websiteId],
    queryFn: async () => (await api.get(`/websites/${websiteId}/seo-changes?limit=100`)).data,
    refetchInterval: 30000,
  });

  if (changes.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-4 h-4 text-orange-500" />
        <h2 className="font-semibold text-gray-900">Tous les changements récents</h2>
        <span className="ml-auto text-xs text-gray-400">{changes.length} changement(s)</span>
      </div>
      <div className="space-y-2">
        {changes.slice(0, 20).map((c) => {
          const sev = SEVERITY[c.field] ?? { label: "Info", cls: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
          return (
            <div key={c.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${sev.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-800">{FIELD_LABELS[c.field] ?? c.field}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${sev.cls}`}>{sev.label}</span>
                  <span className="text-xs text-gray-400 truncate max-w-xs" title={c.page_url}>
                    {c.page_url.replace(/^https?:\/\//, "")}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(c.detected_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SEOChangesPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: monitors = [], isLoading } = useQuery<SEOMonitor[]>({
    queryKey: ["seo-monitors", id],
    queryFn: async () => (await api.get(`/websites/${id}/seo-changes/monitors`)).data,
    refetchInterval: 30000,
  });

  const { data: website } = useQuery({
    queryKey: ["website", id],
    queryFn: async () => (await api.get(`/websites/${id}`)).data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (monitorId: number) => api.delete(`/websites/${id}/seo-changes/monitors/${monitorId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seo-monitors", id] }),
  });

  const totalChanges = monitors.reduce((s, m) => s + m.changes_count, 0);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopNav title="Changements SEO" />
        <main className="p-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <Link href={`/websites/${id}`} className="text-sm text-blue-600 hover:underline">← Retour au site</Link>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Ajouter des URL
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 h-40 animate-pulse" />)}
            </div>
          ) : monitors.length === 0 ? (
            /* ── Empty state ── */
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center max-w-2xl mx-auto">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Tag className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Surveillez vos éléments SEO</h2>
              <p className="text-gray-500 text-sm mb-8">
                Suivez les balises title, méta-descriptions, H1, URL canoniques et le balisage de schéma.
                Recevez des alertes en cas de modification.
              </p>
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { icon: <Tag className="w-6 h-6 text-blue-600" />, title: "Ajouter des URL", desc: "Indiquez les pages importantes à surveiller" },
                  { icon: <Layers className="w-6 h-6 text-purple-600" />, title: "Configurer les vérifications", desc: "Choisissez les éléments et la fréquence" },
                  { icon: <Bell className="w-6 h-6 text-orange-500" />, title: "Recevoir des alertes", desc: "Notification email & Telegram à chaque changement" },
                ].map((f, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 text-center">
                    <div className="flex items-center justify-center mb-2">{f.icon}</div>
                    <p className="text-xs font-semibold text-gray-800 mb-1">{f.title}</p>
                    <p className="text-xs text-gray-500">{f.desc}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 mx-auto">
                <Plus className="w-5 h-5" /> Ajouter ma première URL
              </button>
            </div>
          ) : (
            <>
              {/* Stats bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg"><Globe className="w-4 h-4 text-blue-600" /></div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{monitors.length}</p>
                    <p className="text-xs text-gray-500">Pages surveillées</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="p-2 bg-orange-50 rounded-lg"><AlertTriangle className="w-4 h-4 text-orange-500" /></div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{totalChanges}</p>
                    <p className="text-xs text-gray-500">Changements détectés</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg"><Check className="w-4 h-4 text-green-600" /></div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{monitors.filter((m) => m.is_active).length}</p>
                    <p className="text-xs text-gray-500">Moniteurs actifs</p>
                  </div>
                </div>
              </div>

              {/* Monitor grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {monitors.map((m) => (
                  <MonitorCard
                    key={m.id}
                    monitor={m}
                    websiteId={id}
                    onDelete={() => deleteMutation.mutate(m.id)}
                  />
                ))}
              </div>

              {/* Global changes feed */}
              {totalChanges > 0 && <ChangesFeed websiteId={id} />}
            </>
          )}
        </main>
      </div>

      {showAdd && (
        <AddMonitorModal
          websiteId={id}
          domain={website?.domain}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
