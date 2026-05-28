import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeadScripts, SiteBodyScripts } from "@/components/SiteScripts";

export const metadata: Metadata = {
  title: "SEO Alert Scan",
  description: "Surveillez la santé SEO de vos sites en temps réel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <SiteHeadScripts />
      </head>
      <body>
        <SiteBodyScripts />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
