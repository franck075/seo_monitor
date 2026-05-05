import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

const BACKEND = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

interface SiteScripts {
  head_priority?: string;
  head?: string;
  body?: string;
  head_legacy?: string;
  body_legacy?: string;
}

async function fetchSiteScripts(): Promise<SiteScripts> {
  try {
    const res = await fetch(`${BACKEND}/api/v1/site-scripts`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
}

// Extract <script> and <noscript> tags from raw HTML string
function parseScriptTags(raw: string): Array<{ type: "script" | "noscript"; src?: string; content: string; attrs: string }> {
  if (!raw?.trim()) return [];
  const results: Array<{ type: "script" | "noscript"; src?: string; content: string; attrs: string }> = [];
  const regex = /<(script|noscript)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const tagType = match[1].toLowerCase() as "script" | "noscript";
    const attrs = match[2];
    const content = match[3].trim();
    const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
    results.push({ type: tagType, src: srcMatch?.[1], content, attrs });
  }
  return results;
}

function RenderScripts({ raw }: { raw?: string }) {
  const tags = parseScriptTags(raw || "");
  return (
    <>
      {tags.map((tag, i) => {
        if (tag.type === "noscript") {
          return <noscript key={i} dangerouslySetInnerHTML={{ __html: tag.content }} />;
        }
        if (tag.src) {
          const isAsync = /\basync\b/i.test(tag.attrs);
          const isDefer = /\bdefer\b/i.test(tag.attrs);
          return <script key={i} src={tag.src} async={isAsync} defer={isDefer} />;
        }
        if (tag.content) {
          return <script key={i} dangerouslySetInnerHTML={{ __html: tag.content }} />;
        }
        return null;
      })}
    </>
  );
}

export const metadata: Metadata = {
  title: "SEO Alert Scan",
  description: "Surveillez la santé SEO de vos sites en temps réel.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const scripts = await fetchSiteScripts();

  return (
    <html lang="fr">
      <head>
        <RenderScripts raw={scripts.head_priority} />
        <RenderScripts raw={scripts.head} />
        <RenderScripts raw={scripts.head_legacy} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <RenderScripts raw={scripts.body} />
        <RenderScripts raw={scripts.body_legacy} />
      </body>
    </html>
  );
}
