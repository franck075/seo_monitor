"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, Mail, Send, Check, Settings, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

interface AlertRule {
  id: number;
  website_id: number;
  metric: string;
  threshold?: number;
  window_minutes?: number;
  channels: string[];
  is_active: boolean;
  created_at: string;
}

interface AlertEvent {
  id: number;
  website_id: number;
  metric_value?: number;
  context_json?: Record<string, unknown>;
  channels_sent: string[];
  status: string;
  fired_at: string;
  rule?: { metric: string };
}

interface Website {
  id: number;
  domain: string;
  display_name?: string;
}

const METRIC_LABELS: Record<string, string> = {
  keyword_position_drop: "Baisse de position mot-clé",
  impressions_drop: "Chute des impressions globales GSC",
  clicks_drop: "Chute des clics globaux GSC",
  ctr_drop: "Baisse du CTR global",
  keyword_impressions_drop: "Mots-clés en baisse d'impressions",
  keyword_clicks_drop: "Mots-clés en baisse de clics",
  page_impressions_drop: "Pages en baisse d'impressions",
  zero_organic_pages_monthly: "Rapport mensuel pages sans trafic organique",
  traffic_drop: "Chute de trafic GA4",
  vitals_degradation: "Dégradation Core Web Vitals",
  seo_change_detected: "Changement SEO détecté",
  http_error: "Erreur HTTP (4xx/5xx)",
  robots_changed: "Modification robots.txt",
  sitemap_url_removed: "URL supprimée du sitemap",
  indexation_error_spike: "Pic d'erreurs d'indexation",
};

const METRIC_DESCRIPTIONS: Record<string, string> = {
  keyword_position_drop: "Alerte si un mot-clé dépasse la position seuil définie",
  impressions_drop: "Alerte si les impressions totales du site chutent de X% vs la moyenne des 7 derniers jours",
  clicks_drop: "Alerte si les clics totaux du site chutent de X% vs la moyenne des 7 derniers jours",
  ctr_drop: "Alerte si le CTR global baisse de X points vs la moyenne des 7 derniers jours",
  keyword_impressions_drop: "Alerte avec la liste des mots-clés ayant perdu plus de X% d'impressions (7j vs 7j précédents)",
  keyword_clicks_drop: "Alerte avec la liste des mots-clés ayant perdu plus de X% de clics (7j vs 7j précédents)",
  page_impressions_drop: "Alerte avec la liste des pages ayant perdu plus de X% d'impressions (7j vs 7j précédents)",
  zero_organic_pages_monthly: "Rapport envoyé le dernier jour de chaque mois listant toutes les pages de ton site sans aucune visite organique GA4 ce mois-ci",
  traffic_drop: "Alerte si le trafic GA4 chute de X% par rapport à la veille",
  vitals_degradation: "Alerte si LCP, CLS ou INP passe en 'mauvais'",
  seo_change_detected: "Alerte dès qu'une balise SEO est modifiée",
  http_error: "Alerte si une page retourne une erreur 4xx ou 5xx",
  robots_changed: "Alerte si le contenu du robots.txt change",
  sitemap_url_removed: "Alerte si des URLs disparaissent du sitemap",
  indexation_error_spike: "Alerte si les erreurs d'indexation augmentent significativement",
};

const METRIC_THRESHOLD_LABEL: Record<string, string> = {
  keyword_position_drop: "Position seuil (ex: 10)",
  impressions_drop: "Baisse seuil en % (ex: 30 = 30%)",
  clicks_drop: "Baisse seuil en % (ex: 30 = 30%)",
  ctr_drop: "Baisse seuil en pts (ex: 2 = 2 points)",
  keyword_impressions_drop: "Baisse seuil en % (ex: 30 = 30%)",
  keyword_clicks_drop: "Baisse seuil en % (ex: 30 = 30%)",
  page_impressions_drop: "Baisse seuil en % (ex: 30 = 30%)",
  traffic_drop: "Baisse seuil en % (ex: 30 = 30%)",
  zero_organic_pages_monthly: "Pas de seuil — rapport complet automatique",
  indexation_error_spike: "Multiplicateur (ex: 1.5)",
};

function NotificationSettingsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [alertEmail, setAlertEmail] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [saved, setSaved] = useState(false);

  const { data } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: async () => (await api.get("/alerts/notification-settings")).data,
  });

  useEffect(() => {
    if (data) {
      setAlertEmail(data.alert_email || "");
      setTelegramId(data.telegram_chat_id || "");
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => api.put("/alerts/notification-settings", {
      alert_email: alertEmail || null,
      telegram_chat_id: telegramId || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const emailConfigured = !!(data?.alert_email || data?.account_email);
  const telegramConfigured = !!data?.telegram_chat_id;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <Settings className="w-4 h-4 text-gray-500" />
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">Paramètres de notification</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Email : <span className={emailConfigured ? "text-green-600" : "text-gray-400"}>{data?.alert_email || data?.account_email || "—"}</span>
              {" · "}
              Telegram : <span className={telegramConfigured ? "text-green-600" : "text-gray-400"}>{telegramConfigured ? "Configuré" : "Non configuré"}</span>
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-5">
          {/* Email */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-1">
              <Mail className="w-4 h-4 text-blue-500" /> Email d&apos;alerte
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Laissez vide pour utiliser l&apos;email du compte (<span className="font-medium text-gray-600">{data?.account_email}</span>)
            </p>
            <input
              type="email"
              value={alertEmail}
              onChange={e => setAlertEmail(e.target.value)}
              placeholder={data?.account_email || "ex: alertes@monsite.com"}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Telegram */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-1">
              <Send className="w-4 h-4 text-blue-500" /> Telegram Chat ID
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Pour obtenir votre Chat ID : envoyez un message à{" "}
              <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer"
                className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
                @userinfobot <ExternalLink className="w-3 h-3" />
              </a>
              {" "}sur Telegram, il vous répondra avec votre ID.
            </p>
            <input
              type="text"
              value={telegramId}
              onChange={e => setTelegramId(e.target.value)}
              placeholder="ex: 123456789"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saveMutation.isPending ? "Sauvegarde…" : "Enregistrer"}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <Check className="w-4 h-4" /> Sauvegardé
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AlertsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    website_id: "",
    metric: "traffic_drop",
    threshold: "20",
    window_minutes: "1440",
    channels: ["email"],
  });

  const { data: rules, isLoading: rulesLoading } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: async () => (await api.get("/alerts/rules")).data as AlertRule[],
  });

  const { data: events } = useQuery({
    queryKey: ["alert-events"],
    queryFn: async () => (await api.get("/alerts/events")).data as AlertEvent[],
  });

  const { data: websites } = useQuery({
    queryKey: ["websites"],
    queryFn: async () => (await api.get("/websites/")).data as Website[],
  });

  const createRule = useMutation({
    mutationFn: async (data: {
      website_id: number;
      name: string;
      metric: string;
      condition: string;
      threshold?: number;
      window_minutes?: number;
      channels: string[];
    }) => api.post("/alerts/rules", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert-rules"] });
      setShowForm(false);
      setForm({ website_id: "", metric: "traffic_drop", threshold: "20", window_minutes: "1440", channels: ["email"] });
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: number) => api.delete(`/alerts/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/alerts/rules/${id}`, { is_active } as Record<string, unknown>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.website_id) return;
    createRule.mutate({
      website_id: Number(form.website_id),
      name: METRIC_LABELS[form.metric] ?? form.metric,
      metric: form.metric,
      condition: ["traffic_drop", "keyword_position_drop", "indexation_error_spike", "impressions_drop", "clicks_drop", "ctr_drop"].includes(form.metric) ? "gt" : "any",
      threshold: form.threshold ? Number(form.threshold) : undefined,
      window_minutes: form.window_minutes ? Number(form.window_minutes) : undefined,
      channels: form.channels,
    });
  };

  const toggleChannel = (channel: string) => {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(channel)
        ? f.channels.filter((c) => c !== channel)
        : [...f.channels, channel],
    }));
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1">
        <TopNav title="Alertes" />
        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Regles d&apos;alerte</h1>
              <p className="text-sm text-gray-500 mt-0.5">Configurez des alertes Email et Telegram pour chaque probleme detecte</p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nouvelle regle
            </button>
          </div>

          <NotificationSettingsPanel />

          {showForm && (
            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-blue-200 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Nouvelle regle d&apos;alerte</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Site web</label>
                  <select
                    value={form.website_id}
                    onChange={(e) => setForm((f) => ({ ...f, website_id: e.target.value }))}
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choisir un site...</option>
                    {websites?.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.display_name || w.domain}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Metrique</label>
                  <select
                    value={form.metric}
                    onChange={(e) => {
                      const m = e.target.value;
                      const defaults: Record<string, string> = {
                        impressions_drop: "30", clicks_drop: "30", ctr_drop: "2",
                        traffic_drop: "30", keyword_position_drop: "10", indexation_error_spike: "1.5",
                      };
                      setForm((f) => ({ ...f, metric: m, threshold: defaults[m] ?? "" }));
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(METRIC_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">{METRIC_DESCRIPTIONS[form.metric]}</p>
                </div>

                {METRIC_THRESHOLD_LABEL[form.metric] && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {METRIC_THRESHOLD_LABEL[form.metric]}
                    </label>
                    <input
                      type="number"
                      value={form.threshold}
                      onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {form.metric === "seo_change_detected" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Fenetre (minutes)</label>
                    <input
                      type="number"
                      value={form.window_minutes}
                      onChange={(e) => setForm((f) => ({ ...f, window_minutes: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Canaux de notification</label>
                <div className="flex gap-3">
                  {["email", "telegram"].map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => toggleChannel(channel)}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        form.channels.includes(channel)
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-gray-200 text-gray-600 hover:border-blue-300"
                      }`}
                    >
                      {channel === "email" ? "Email" : "Telegram"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={createRule.isPending}
                  className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {createRule.isPending ? "Enregistrement..." : "Creer la regle"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

          {rulesLoading ? (
            <div className="p-8 text-center text-gray-400">Chargement...</div>
          ) : !rules?.length ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Aucune regle d&apos;alerte</p>
              <p className="text-sm text-gray-400 mt-1">Cliquez sur &quot;Nouvelle regle&quot; pour commencer la surveillance</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const site = websites?.find((w) => w.id === rule.website_id);
                return (
                  <div key={rule.id} className={`bg-white rounded-xl border p-5 flex items-center gap-4 ${rule.is_active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{METRIC_LABELS[rule.metric] ?? rule.metric}</span>
                        {rule.channels.map((ch) => (
                          <span key={ch} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                            {ch === "email" ? "Email" : "Telegram"}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-gray-500">
                        {site?.display_name || site?.domain || `Site #${rule.website_id}`}
                        {rule.threshold != null && ` · Seuil: ${rule.threshold}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleRule.mutate({ id: rule.id, is_active: !rule.is_active })}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title={rule.is_active ? "Desactiver" : "Activer"}
                      >
                        {rule.is_active
                          ? <ToggleRight className="w-6 h-6 text-blue-600" />
                          : <ToggleLeft className="w-6 h-6" />}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Supprimer cette regle ?")) deleteRule.mutate(rule.id);
                        }}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {events && events.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-5 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Historique des alertes declenchees</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Metrique</th>
                    <th className="px-4 py-3 text-left">Valeur</th>
                    <th className="px-4 py-3 text-left">Canaux</th>
                    <th className="px-4 py-3 text-right">Declenchee le</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {ev.rule ? METRIC_LABELS[ev.rule.metric] ?? ev.rule.metric : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {ev.metric_value != null ? ev.metric_value.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {ev.channels_sent.map((ch) => (
                            <span key={ch} className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              {ch}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">
                        {new Date(ev.fired_at).toLocaleString("fr-FR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
