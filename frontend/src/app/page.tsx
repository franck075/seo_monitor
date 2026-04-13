import type { Metadata } from "next";
import LandingClient from "./LandingClient";

const BACKEND = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

async function fetchSeoSettings() {
  try {
    const res = await fetch(`${BACKEND}/api/v1/seo-settings`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const seo = await fetchSeoSettings();
  return {
    title: seo?.meta_title || "SEO Alert Scan — Monitoring SEO automatise 24/7",
    description:
      seo?.meta_description ||
      "Surveillez vos positions Google, Core Web Vitals et uptime en temps reel. Alertes email et Telegram. Essai gratuit 7 jours.",
  };
}

export default async function Page() {
  const seo = await fetchSeoSettings();

  return (
    <>
      {seo?.structured_data && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(seo.structured_data) }}
        />
      )}
      <LandingClient />
    </>
  );
}
