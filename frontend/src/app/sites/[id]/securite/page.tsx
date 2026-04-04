"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import {
  Shield, ShieldAlert, ShieldCheck, Scan, CheckCircle2,
  AlertTriangle, ExternalLink, RefreshCw, ChevronDown, ChevronUp,
  Bug, EyeOff, FileX,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Detection = {
  id: number;
  url: string;
  detected_at: string;
  detection_type: "spam_keyword" | "hidden_link" | "injected_page";
  severity: "high" | "medium";
  detail: string;
  sample: string;
  is_resolved: boolean;
  resolved_at: string | null;
};

type Summary = {
  spam_keyword: number;
  hidden_link: number;
  injected_page: number;
  total: number;
};

// ── Config per detection type ──────────────────────────────────────────────────

const TYPE_CONFIG = {
  spam_keyword: {
    label: "Mots-clés spam",
    icon: Bug,
    desc: "Mots-clés pharmaceutiques ou indésirables détectés dans Google Search Console",
    accentBg: "bg-red-50",
    accentBorder: "border-red-200",
    accentText: "text-red-700",
    badge: "bg-red-100 text-red-700",
  },
  hidden_link: {
    label: "Liens cachés",
    icon: EyeOff,
    desc: "Liens dissimulés via CSS injectés dans le HTML de vos pages",
    accentBg: "bg-orange-50",
    accentBorder: "border-orange-200",
    accentText: "text-orange-700",
    badge: "bg-orange-100 text-orange-700",
  },
  injected_page: {
    label: "Pages injectées",
    icon: FileX,
    desc: "URLs indexées par Google absentes de votre sitemap — pages fantômes potentielles",
    accentBg: "bg-purple-50",
    accentBorder: "border-purple-200",
    accentText: "text-purple-700",
    badge: "bg-purple-100 text-purple-700",
  },
};

// ── Section component ──────────────────────────────────────────────────────────

function DetectionSection({
  type, detections, onResolve, resolving,
}: {
  type: keyof typeof TYPE_CONFIG;
  detections: Detection[];
  onResolve: (id: number) => void;
  resolving: number | null;
}) {
  const [open, setOpen] = useState(true);
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;
  const active = detections.filter((d) => !d.is_resolved);
  const resolved = detections.filter((d) => d.is_resolved);

  return (
    <div className={`rounded-2xl border ${cfg.accentBorder} ${cfg.accentBg} overflow-hidden`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl bg-white shadow-sm`}>
            <Icon className={`w-5 h-5 ${cfg.accentText}`} />
          </div>
          <div className="text-left">
            <p className={`font-semibold ${cfg.accentText}`}>{cfg.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{cfg.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {active.length > 0 && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
              {active.length} actif{active.length > 1 ? "s" : ""}
            </span>
          )}
          {active.length === 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Propre
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && detections.length > 0 && (
        <div className="border-t border-white/60 bg-white/70 divide-y divide-gray-100">
          {active.map((d) => (
            <DetectionRow key={d.id} d={d} onResolve={onResolve} resolving={resolving} cfg={cfg} />
          ))}
          {resolved.map((d) => (
            <DetectionRow key={d.id} d={d} onResolve={onResolve} resolving={resolving} cfg={cfg} />
          ))}
        </div>
      )}

      {open && detections.length === 0 && (
        <div className="border-t border-white/60 bg-white/70 px-6 py-8 text-center text-gray-400 text-sm">
          Aucune détection pour cette catégorie.
        </div>
      )}
    </div>
  );
}

function DetectionRow({
  d, onResolve, resolving, cfg,
}: {
  d: Detection;
  onResolve: (id: number) => void;
  resolving: number | null;
  cfg: (typeof TYPE_CONFIG)[keyof typeof TYPE_CONFIG];
}) {
  const [showSample, setShowSample] = useState(false);

  return (
    <div className={`px-6 py-4 ${d.is_resolved ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {d.severity === "high" ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                <AlertTriangle className="w-3 h-3" /> Critique
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">
                <AlertTriangle className="w-3 h-3" /> Moyen
              </span>
            )}
            {d.is_resolved && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                <CheckCircle2 className="w-3 h-3" /> Résolu
              </span>
            )}
            <span className="text-xs text-gray-400">
              {new Date(d.detected_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-800 mb-1 truncate">{d.detail}</p>
          <a
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            {d.url.length > 70 ? d.url.slice(0, 70) + "…" : d.url}
            <ExternalLink className="w-3 h-3" />
          </a>
          {d.sample && (
            <button
              onClick={() => setShowSample((s) => !s)}
              className="block mt-2 text-xs text-gray-400 hover:text-gray-600 underline"
            >
              {showSample ? "Masquer l'extrait" : "Voir l'extrait"}
            </button>
          )}
          {showSample && d.sample && (
            <pre className="mt-2 p-3 bg-gray-900 text-gray-100 text-xs rounded-lg overflow-x-auto max-w-full">
              {d.sample}
            </pre>
          )}
        </div>
        {!d.is_resolved && (
          <button
            onClick={() => onResolve(d.id)}
            disabled={resolving === d.id}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
          >
            {resolving === d.id ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            )}
            Résolu
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const { id } = useParams<{ id: string }>();
  const websiteId = parseInt(id);
  const qc = useQueryClient();
  const [resolving, setResolving] = useState<number | null>(null);

  const { data: summary } = useQuery<Summary>({
    queryKey: ["security-summary", websiteId],
    queryFn: () => api.get(`/websites/${websiteId}/security/hack-detections/summary`).then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: detections = [], isLoading } = useQuery<Detection[]>({
    queryKey: ["hack-detections", websiteId],
    queryFn: () => api.get(`/websites/${websiteId}/security/hack-detections`).then((r) => r.data),
    staleTime: 60_000,
  });

  const scanMutation = useMutation({
    mutationFn: () => api.post(`/websites/${websiteId}/security/hack-scan`),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ["hack-detections", websiteId] }), 5000);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (detectionId: number) =>
      api.patch(`/websites/${websiteId}/security/hack-detections/${detectionId}/resolve`),
    onMutate: (id) => setResolving(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hack-detections", websiteId] });
      qc.invalidateQueries({ queryKey: ["security-summary", websiteId] });
      setResolving(null);
    },
    onError: () => setResolving(null),
  });

  const byType = (type: keyof typeof TYPE_CONFIG) =>
    detections.filter((d) => d.detection_type === type);

  const totalActive = summary?.total ?? 0;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNav title="Sécurité" />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl shadow-sm ${totalActive > 0 ? "bg-red-100" : "bg-green-100"}`}>
                {totalActive > 0 ? (
                  <ShieldAlert className="w-7 h-7 text-red-600" />
                ) : (
                  <ShieldCheck className="w-7 h-7 text-green-600" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Sécurité SEO</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Détection de hack : mots-clés spam, liens cachés, pages injectées
                </p>
              </div>
            </div>
            <button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60 shadow-sm"
            >
              {scanMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Scan className="w-4 h-4" />
              )}
              Lancer un scan
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {(
              [
                {
                  label: "Total actifs",
                  value: totalActive,
                  icon: Shield,
                  color: totalActive > 0 ? "text-red-600 bg-red-50" : "text-green-600 bg-green-50",
                },
                {
                  label: "Mots-clés spam",
                  value: summary?.spam_keyword ?? 0,
                  icon: Bug,
                  color: (summary?.spam_keyword ?? 0) > 0 ? "text-red-600 bg-red-50" : "text-gray-400 bg-gray-50",
                },
                {
                  label: "Liens cachés",
                  value: summary?.hidden_link ?? 0,
                  icon: EyeOff,
                  color: (summary?.hidden_link ?? 0) > 0 ? "text-orange-600 bg-orange-50" : "text-gray-400 bg-gray-50",
                },
                {
                  label: "Pages injectées",
                  value: summary?.injected_page ?? 0,
                  icon: FileX,
                  color: (summary?.injected_page ?? 0) > 0 ? "text-purple-600 bg-purple-50" : "text-gray-400 bg-gray-50",
                },
              ] as const
            ).map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <div className={`inline-flex p-2 rounded-xl mb-3 ${color.split(" ")[1]}`}>
                  <Icon className={`w-5 h-5 ${color.split(" ")[0]}`} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Status banner */}
          {!isLoading && totalActive === 0 && detections.length === 0 && (
            <div className="flex items-center gap-4 p-6 bg-green-50 border border-green-200 rounded-2xl mb-6">
              <ShieldCheck className="w-8 h-8 text-green-500 shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Aucune menace détectée</p>
                <p className="text-sm text-green-600 mt-0.5">
                  Lancez un scan pour analyser vos pages et données Search Console.
                </p>
              </div>
            </div>
          )}

          {scanMutation.isSuccess && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6 text-sm text-blue-700">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Scan en cours — les résultats apparaîtront dans quelques secondes...
            </div>
          )}

          {/* Detection sections */}
          {isLoading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {(["spam_keyword", "hidden_link", "injected_page"] as const).map((type) => (
                <DetectionSection
                  key={type}
                  type={type}
                  detections={byType(type)}
                  onResolve={(id) => resolveMutation.mutate(id)}
                  resolving={resolving}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
