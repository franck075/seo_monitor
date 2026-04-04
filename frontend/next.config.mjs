/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      // Anciennes routes anglaises → nouvelles routes françaises (301 permanent)
      { source: "/login",            destination: "/connexion",        permanent: true },
      { source: "/register",         destination: "/inscription",      permanent: true },
      { source: "/dashboard",        destination: "/tableau-de-bord",  permanent: true },
      { source: "/billing",          destination: "/abonnement",       permanent: true },
      { source: "/billing/:path*",   destination: "/abonnement/:path*",permanent: true },
      { source: "/alerts",           destination: "/alertes",          permanent: true },
      { source: "/settings",         destination: "/parametres",       permanent: true },
      { source: "/websites/new",     destination: "/sites/nouveau",    permanent: true },
      // Sous-routes des sites
      { source: "/websites/:id/http-checks",   destination: "/sites/:id/surveillance-http", permanent: true },
      { source: "/websites/:id/insights",      destination: "/sites/:id/analyses",          permanent: true },
      { source: "/websites/:id/keywords",      destination: "/sites/:id/mots-cles",         permanent: true },
      { source: "/websites/:id/links",         destination: "/sites/:id/liens",             permanent: true },
      { source: "/websites/:id/security",      destination: "/sites/:id/securite",          permanent: true },
      { source: "/websites/:id/seo-changes",   destination: "/sites/:id/changements-seo",  permanent: true },
      { source: "/websites/:id/seo-issues",    destination: "/sites/:id/monitoring-avance", permanent: true },
      { source: "/websites/:id/traffic",       destination: "/sites/:id/trafic",            permanent: true },
      { source: "/websites/:id/vitals",        destination: "/sites/:id/performance",       permanent: true },
      { source: "/websites/:id/indexation",    destination: "/sites/:id/indexation",        permanent: true },
      { source: "/websites/:id/sitemaps",      destination: "/sites/:id/sitemaps",          permanent: true },
      { source: "/websites/:id",               destination: "/sites/:id",                   permanent: true },
      { source: "/websites",                   destination: "/sites",                       permanent: true },
    ];
  },
};

export default nextConfig;
