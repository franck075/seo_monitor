"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { BarChart2, Check, ChevronRight, Plus, Minus, Menu, X } from "lucide-react";

interface ClientLogoItem {
  id: number;
  name: string;
  logo_url: string;
  website_url?: string;
  position: number;
}

const STATIC_CLIENT_NAMES = ["Pixlstudio", "PixlEvent", "Asahci", "Agekaf", "CIP SARL", "ICOGEF"];

const features = [
  {
    emoji: "📈", title: "Mots-clés & Positions",
    desc: "Suivez l'évolution de vos positions Google Search Console au quotidien et détectez les baisses avant vos concurrents.",
  },
  {
    emoji: "📊", title: "Trafic & Analytics",
    desc: "Analysez votre trafic organique via Google Analytics 4 en temps réel pour repérer les anomalies de visites instantanément.",
  },
  {
    emoji: "⚡", title: "Core Web Vitals",
    desc: "Mesurez en continu le LCP, CLS, INP et votre score global pour offrir une expérience parfaite aux yeux de Google.",
  },
  {
    emoji: "🚨", title: "Uptime & Monitoring HTTP",
    desc: "Soyez alerté immédiatement (Email/Telegram) en cas d'erreur 404, 500 ou de lenteur critique sur vos pages.",
  },
  {
    emoji: "🤖", title: "Contrôle de l'Indexation",
    desc: "Vérifiez automatiquement l'état d'indexation de vos URLs stratégiques dans la Google Search Console.",
  },
  {
    emoji: "🗺️", title: "Suivi des Sitemaps",
    desc: "Détectez et contrôlez automatiquement les URLs ajoutées ou supprimées de vos sitemaps XML.",
  },
  {
    emoji: "🕵️", title: "Détection des Changements SEO",
    desc: "Suivez chaque modification de balises Title, Meta Description et H1 sur vos pages clés.",
  },
  {
    emoji: "🔬", title: "Insights SEO Avancé",
    desc: "Cannibalisation, chutes de positions, contenus vieillissants, redirections cassées — 12 cas de monitoring automatique.",
  },
  {
    emoji: "🛡️", title: "Sécurité SEO (Hack Detection)",
    desc: "Détectez automatiquement les injections de spam, les liens cachés et les pages piratées avant que Google ne vous pénalise.",
  },
  {
    emoji: "📋", title: "Rapport Mensuel",
    desc: "Recevez chaque mois un rapport complet : performances GSC, trafic GA4, issues détectées, Core Web Vitals et évolution des mots-clés.",
  },
  {
    emoji: "🔗", title: "Veille Backlinks",
    desc: "Surveillez l'acquisition et la perte de vos liens entrants pour protéger votre autorité de domaine.",
  },
];

const ANNUAL_DISCOUNT = 10; // 10 months = 2 months free

const plans = [
  {
    key: "starter",
    name: "Starter", emoji: "🟢",
    monthly: 5_900, annual: 59_000,
    desc: "Pour les indépendants et petits projets",
    color: "border-gray-200", badge: "", sites: "1 site surveillé",
    cta: "Commencer gratuitement", ctaStyle: "bg-gray-100 text-gray-800 hover:bg-gray-200",
    features: [
      "1 site monitoré",
      "Mots-clés & positions GSC",
      "Core Web Vitals",
      "Monitoring HTTP & uptime",
      "Alertes email",
      "Support standard",
    ],
  },
  {
    key: "pro",
    name: "Pro", emoji: "🔵",
    monthly: 17_900, annual: 179_000,
    desc: "Pour les professionnels du web exigeants",
    color: "border-blue-500", badge: "⭐ Le plus populaire", sites: "Jusqu'à 5 sites surveillés",
    cta: "Tester le plan Pro", ctaStyle: "bg-blue-600 text-white hover:bg-blue-700",
    features: [
      "5 sites monitorés",
      "Tout du plan Starter, plus :",
      "Trafic organique GA4",
      "Sitemaps & Indexation",
      "Détection changements SEO",
      "Insights SEO avancé",
      "Monitoring SEO avancé (12 cas)",
      "Sécurité SEO (hack detection)",
      "Rapport mensuel PDF",
      "Alertes Telegram",
      "Support prioritaire",
    ],
  },
  {
    key: "agency",
    name: "Agence", emoji: "🟣",
    monthly: 49_900, annual: 499_000,
    desc: "Pour les agences et grandes équipes",
    color: "border-violet-500", badge: "Illimité", sites: "Sites illimités",
    cta: "Nous contacter", ctaStyle: "bg-violet-600 text-white hover:bg-violet-700",
    features: [
      "Sites illimités",
      "Tout du plan Pro, plus :",
      "Multi-utilisateurs",
      "Dashboard d'administration",
      "Onboarding dédié par un expert",
      "Support premium prioritaire",
    ],
  },
];

const targets = [
  { emoji: "🛒", title: "E-commerçants & Boutiques en ligne", desc: "Une page catégorie qui tombe en erreur 404, c'est du chiffre d'affaires perdu instantanément. Soyez alerté avant que vos ventes ne chutent." },
  { emoji: "📈", title: "Agences SEO & Freelances", desc: "Arrêtez de vérifier manuellement les sites de vos clients tous les matins. Centralisez le monitoring et justifiez votre valeur ajoutée avec notre tableau de bord." },
  { emoji: "📰", title: "Éditeurs de sites & Blogueurs", desc: "Une mise à jour de thème a cassé vos balises H1 ? Vos concurrents vous volent vos positions ? Réagissez immédiatement grâce à nos alertes de changements." },
  { emoji: "🏪", title: "TPE & PME", desc: "Vous n'avez pas d'équipe SEO dédiée ? SEO Alert Scan devient votre vigie digitale. Soyez informé de tout changement critique sur votre site, sans expertise technique requise." },
  { emoji: "🌍", title: "Multinationales & Grands Groupes", desc: "Gérez la performance SEO de dizaines de domaines depuis un seul tableau de bord. Uniformisez le monitoring de vos filiales et détectez les anomalies à l'échelle." },
];

const steps = [
  { emoji: "🔗", step: "01", title: "Connectez vos outils (1 minute)", desc: "Connectez vos comptes Google Search Console, Google Analytics et vos outils SEO en quelques clics grâce à notre intégration sécurisée. Aucun plugin à installer." },
  { emoji: "⚙️", step: "02", title: "Configurez vos alertes (1 minute)", desc: "Choisissez vos canaux de réception (Email, Telegram) et définissez vos seuils de tolérance (chute de trafic, temps de réponse serveur, baisse de positions)." },
  { emoji: "☕", step: "03", title: "Détendez-vous, on surveille (24h/24)", desc: "C'est tout ! SEO Alert Scan scanne vos sites en arrière-plan. Vous recevrez une alerte instantanée uniquement si votre attention est requise." },
];

const faqs = [
  {
    q: "Pourquoi utiliser SEO Alert Scan plutôt que Google Search Console ou Analytics directement ?",
    a: "C'est la différence entre chercher l'information et la recevoir. GSC et GA4 ne vous enverront pas d'alerte Telegram immédiate si votre balise Title disparaît ou si votre site passe en erreur 500. Nous centralisons tout et vous alertons uniquement quand c'est nécessaire.",
  },
  {
    q: "Mes données sont-elles en sécurité ?",
    a: "Absolument. SEO Alert Scan utilise le protocole officiel OAuth (Google) et des API en lecture seule (Read-Only). Nous ne pouvons rien modifier sur vos comptes. Vos données sont chiffrées de bout en bout.",
  },
  {
    q: "Dois-je installer un plugin (WordPress, Shopify, etc.) sur mon site ?",
    a: "Non, aucun plugin n'est requis. SEO Alert Scan est une solution 100% externe (Cloud) qui interroge les API et crawle vos pages de l'extérieur, peu importe votre CMS.",
  },
  {
    q: "Qu'est-ce que le Monitoring SEO Avancé (12 cas) du plan Pro ?",
    a: "C'est un module de détection automatique qui surveille 12 problèmes SEO critiques : cannibalisation de mots-clés, chutes de positions, redirections en chaîne, contenus vieillissants, désindexation silencieuse, changements de canoniques, modifications du robots.txt, balises noindex, redirections cassées, changements H1, titres en doublon et meta descriptions en doublon.",
  },
  {
    q: "Comment fonctionne la Sécurité SEO (Hack Detection) ?",
    a: "Ce module analyse vos pages à la recherche de 3 types d'attaques : (1) mots-clés pharmaceutiques ou spam dans vos données GSC, (2) liens cachés injectés dans votre HTML, (3) pages piratées indexées par Google mais absentes de votre sitemap. Vous êtes alerté immédiatement si une anomalie est détectée.",
  },
  {
    q: "Y a-t-il une limite sur le nombre de mots-clés ou de pages surveillés ?",
    a: "Nos plans sont conçus pour être généreux. Si vous avez des besoins massifs, notre plan Agence s'adapte à vos volumes. Contactez-nous pour discuter de vos besoins spécifiques.",
  },
  {
    q: "Comment fonctionnent les alertes Telegram du plan Pro et Agence ?",
    a: "Depuis votre tableau de bord, vous obtiendrez un lien vers notre Bot Telegram officiel. Un clic sur \"Start\" suffit pour lier votre compte et recevoir vos alertes critiques sur votre téléphone.",
  },
  {
    q: "Puis-je tester l'outil avant de payer ?",
    a: "Oui ! Nous proposons un essai gratuit pour vous permettre de configurer votre premier site. Aucune carte bancaire n'est requise. Si vous n'êtes pas convaincu, votre compte expirera sans vous facturer.",
  },
  {
    q: "Puis-je modifier mon abonnement en cours de route ?",
    a: "Bien sûr. Vous n'êtes engagé à rien. Vous pouvez passer à un plan supérieur ou annuler votre abonnement à tout moment depuis votre espace client.",
  },
];

function fmt(n: number) {
  return n.toLocaleString("fr-FR");
}

export default function LandingClient() {
  const [annual, setAnnual] = useState(false);
  const [clientLogos, setClientLogos] = useState<ClientLogoItem[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    fetch("/api/v1/client-logos/active")
      .then(r => r.ok ? r.json() : [])
      .then((data: ClientLogoItem[]) => { if (data && data.length > 0) setClientLogos(data); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">SEO Alert Scan</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-500 font-medium">
            <a href="#fonctionnalites" className="hover:text-gray-900 transition-colors">Fonctionnalités</a>
            <a href="#comment" className="hover:text-gray-900 transition-colors">Comment ça marche</a>
            <a href="#tarifs" className="hover:text-gray-900 transition-colors">Tarifs</a>
            <a href="#faq" className="hover:text-gray-900 transition-colors">FAQ</a>
            <Link href="/blog" className="hover:text-gray-900 transition-colors">Blog</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/connexion" className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2 hidden sm:block">
              Connexion
            </Link>
            <Link href="/inscription" className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
              Essai gratuit
            </Link>
            <button
              onClick={() => setMobileNavOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 ml-1"
              aria-label="Menu"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {/* Mobile nav dropdown */}
        {mobileNavOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-3 flex flex-col gap-1">
            <a href="#fonctionnalites" onClick={() => setMobileNavOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Fonctionnalités</a>
            <a href="#comment" onClick={() => setMobileNavOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Comment ça marche</a>
            <a href="#tarifs" onClick={() => setMobileNavOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Tarifs</a>
            <a href="#faq" onClick={() => setMobileNavOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">FAQ</a>
            <Link href="/blog" onClick={() => setMobileNavOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Blog</Link>
            <div className="border-t border-gray-100 mt-1 pt-2">
              <Link href="/connexion" onClick={() => setMobileNavOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Connexion</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="pt-28 sm:pt-32 pb-16 sm:pb-24 px-4 sm:px-6 bg-gradient-to-b from-blue-50/50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-xs sm:text-sm font-semibold px-4 py-1.5 rounded-full mb-6 sm:mb-8">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            Monitoring SEO automatisé 24h/24 et 7j/7
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-[1.1] mb-5 sm:mb-6 tracking-tight">
            Ne laissez plus une erreur<br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent"> technique ruiner votre trafic SEO.</span>
          </h1>
          <p className="text-base sm:text-xl text-gray-500 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
            Pilotez votre visibilité sans effort. SEO Alert Scan connecte Google Search Console, Google Analytics et PageSpeed pour centraliser votre santé SEO. Soyez alerté en temps réel avant de perdre vos positions.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <Link href="/inscription"
              className="flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 transition-colors text-base shadow-lg shadow-blue-200">
              Commencer mon essai gratuit <ChevronRight className="w-4 h-4" />
            </Link>
            <Link href="/connexion"
              className="flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 px-8 py-4 rounded-xl font-semibold hover:bg-gray-50 transition-colors text-base">
              Voir la démo
            </Link>
          </div>
          <p className="text-sm text-gray-400">
            ✓ Aucune carte bancaire requise · ✓ Configuration en 2 minutes · ✓ Annulation à tout moment
          </p>
        </div>
      </section>

      {/* ── BANDEAU PREUVE SOCIALE ── */}
      <section className="py-10 px-6 border-y border-gray-100 bg-gray-50">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-sm text-gray-400 font-medium mb-6 uppercase tracking-widest">Ils sécurisent leur trafic avec SEO Alert Scan</p>
          <div className="flex flex-wrap justify-center gap-10 items-center opacity-60 grayscale">
            {clientLogos.length > 0 ? (
              clientLogos.map(logo => (
                logo.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={logo.id} src={logo.logo_url} alt={logo.name} className="h-14 max-w-[160px] object-contain" />
                ) : (
                  <span key={logo.id} className="text-2xl font-bold text-gray-700">{logo.name}</span>
                )
              ))
            ) : (
              STATIC_CLIENT_NAMES.map(name => (
                <span key={name} className="text-2xl font-bold text-gray-700">{name}</span>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ── PROBLÈME ── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Le référencement est un acquis fragile.<br className="hidden sm:block" /> Réagissez avant qu&apos;il ne soit trop tard.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
            {[
              { icon: "📉", text: "Vous perdez des positions sur vos mots-clés stratégiques sans savoir pourquoi ?" },
              { icon: "🔧", text: "Une mise à jour a cassé vos balises H1 ou Title à votre insu ?" },
              { icon: "🚫", text: "Votre site est inaccessible et Google risque de désindexer vos pages ?" },
            ].map(({ icon, text }) => (
              <div key={text} className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-start gap-3">
                <span className="text-2xl">{icon}</span>
                <p className="text-gray-700 text-sm font-medium leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
          <div className="text-center">
            <p className="text-gray-500 text-lg mb-6">Ne passez plus des heures à vérifier manuellement vos tableaux de bord. <strong className="text-gray-900">SEO Alert Scan le fait pour vous.</strong></p>
            <Link href="/inscription"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">
              Je veux sécuriser mon SEO <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── CIBLE ── */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Conçu pour ceux qui prennent leur trafic au sérieux.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {targets.map(({ emoji, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl mb-4">{emoji}</div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMMENT ÇA MARCHE ── */}
      <section className="py-20 px-6" id="comment">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Opérationnel en moins de 3 minutes.</h2>
            <p className="text-gray-500 text-lg">Ne perdez plus de temps avec des configurations complexes. SEO Alert Scan est conçu pour la simplicité.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map(({ emoji, step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="relative inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-200">
                  <span className="text-2xl">{emoji}</span>
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-gray-900 text-white text-xs font-bold rounded-full flex items-center justify-center">{step}</span>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-20 px-6 bg-gray-50" id="fonctionnalites">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">L&apos;arsenal complet pour protéger et faire croître votre SEO</h2>
            <p className="text-gray-500 text-lg">11 modules de surveillance pour une tranquillité d&apos;esprit totale.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(({ emoji, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
                <div className="text-3xl mb-3">{emoji}</div>
                <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link href="/inscription"
              className="inline-flex items-center gap-2 border-2 border-blue-600 text-blue-600 px-8 py-3 rounded-xl font-semibold hover:bg-blue-50 transition-colors">
              Découvrir toutes les fonctionnalités en action <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="py-20 px-6" id="tarifs">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Des tarifs simples, sans mauvaise surprise.</h2>
            <p className="text-gray-500 text-lg mb-8">Choisissez le plan adapté à vos ambitions. Évoluez ou annulez à tout moment.</p>

            {/* Toggle mensuel / annuel */}
            <div className="inline-flex items-center gap-3 bg-gray-100 rounded-full p-1">
              <button
                onClick={() => setAnnual(false)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${!annual ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                Mensuel
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${annual ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                Annuel
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">2 mois offerts</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {plans.map((plan) => {
              const price = annual ? plan.annual : plan.monthly;
              const monthlyEquiv = annual ? Math.round(plan.annual / 12) : plan.monthly;
              return (
                <div key={plan.name}
                  className={`relative bg-white rounded-2xl border-2 ${plan.color} p-7 flex flex-col ${plan.name === "Pro" ? "shadow-xl md:-mt-4 md:mb-4" : "shadow-sm"}`}>
                  {plan.badge && (
                    <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap ${plan.name === "Pro" ? "bg-blue-600 text-white" : "bg-violet-600 text-white"}`}>
                      {plan.badge}
                    </div>
                  )}
                  <div className="mb-6">
                    <p className="text-2xl mb-1">{plan.emoji}</p>
                    <p className="font-bold text-gray-900 text-xl">{plan.name}</p>
                    <p className="text-gray-400 text-sm mt-0.5">{plan.desc}</p>
                    <div className="mt-4">
                      {annual ? (
                        <>
                          <div className="flex items-end gap-1">
                            <span className="text-4xl font-extrabold text-gray-900">{fmt(price)}</span>
                            <span className="text-gray-400 mb-1 text-sm">FCFA/an</span>
                          </div>
                          <p className="text-xs text-green-600 font-semibold mt-1">≈ {fmt(monthlyEquiv)} FCFA/mois · 2 mois offerts</p>
                        </>
                      ) : (
                        <div className="flex items-end gap-1">
                          <span className="text-4xl font-extrabold text-gray-900">{fmt(price)}</span>
                          <span className="text-gray-400 mb-1 text-sm">FCFA/mois</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-blue-600 mt-2">{plan.sites}</p>
                  </div>
                  <ul className="space-y-2.5 flex-1 mb-7">
                    {plan.features.map((f) => (
                      <li key={f} className={`flex items-start gap-2.5 text-sm ${f.includes("plus :") ? "text-gray-400 font-medium mt-2" : "text-gray-600"}`}>
                        {!f.includes("plus :") && <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />}
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={plan.key === "agency" ? "mailto:contact@pixlstudio.africa" : "/inscription"}
                    className={`w-full text-center py-3 rounded-xl font-bold text-sm transition-colors ${plan.ctaStyle}`}>
                    {plan.cta}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 px-6 bg-gray-50" id="faq">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Vos questions, nos réponses.</h2>
            <p className="text-gray-500 text-lg">Tout ce que vous devez savoir avant de lancer votre premier monitoring.</p>
          </div>
          <div className="space-y-3">
            {faqs.map(({ q, a }) => (
              <details key={q} className="group bg-white rounded-2xl border border-gray-100 shadow-sm">
                <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer font-semibold text-gray-900 text-sm list-none">
                  {q}
                  <span className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center group-open:bg-blue-100">
                    <Plus className="w-3.5 h-3.5 text-gray-500 group-open:hidden" />
                    <Minus className="w-3.5 h-3.5 text-blue-600 hidden group-open:block" />
                  </span>
                </summary>
                <div className="px-6 pb-5 text-sm text-gray-500 leading-relaxed">{a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 px-6 bg-gradient-to-br from-blue-600 to-violet-700">
        <div className="max-w-3xl mx-auto text-center text-white">
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Prêt à sécuriser votre trafic organique ?</h2>
          <p className="text-blue-100 text-lg mb-8">Rejoignez les professionnels qui ne laissent plus leur SEO au hasard.</p>
          <Link href="/inscription"
            className="inline-flex items-center gap-2 bg-white text-blue-700 px-10 py-4 rounded-xl font-extrabold text-base hover:bg-blue-50 transition-colors shadow-xl">
            Créer mon compte gratuit maintenant <ChevronRight className="w-5 h-5" />
          </Link>
          <p className="text-blue-200 text-sm mt-4">Aucune carte bancaire requise. Configuration en 2 minutes.</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-8 px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center">
              <BarChart2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-700">SEO Alert Scan</span>
          </div>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} SEO Alert Scan. Tous droits réservés.</p>
          <div className="flex gap-6 text-xs text-gray-400">
            <a href="#fonctionnalites" className="hover:text-gray-600">Fonctionnalités</a>
            <a href="#tarifs" className="hover:text-gray-600">Tarifs</a>
            <a href="#faq" className="hover:text-gray-600">FAQ</a>
            <Link href="/connexion" className="hover:text-gray-600">Connexion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
