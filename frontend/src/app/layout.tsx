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

function getAttr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return m?.[1];
}

type ParsedTag =
  | { kind: "meta"; name?: string; content?: string; property?: string; httpEquiv?: string }
  | { kind: "link"; rel?: string; href?: string; attrs: string }
  | { kind: "script"; src?: string; content: string; async: boolean; defer: boolean }
  | { kind: "noscript"; content: string };

function parseHeadElements(raw: string): ParsedTag[] {
  if (!raw?.trim()) return [];
  const results: ParsedTag[] = [];

  // Self-closing: <meta ...> and <link ...>
  const selfClosing = /<(meta|link)([^>]*?)\/?>(?!\s*<\/)/gi;
  let m: RegExpExecArray | null;
  while ((m = selfClosing.exec(raw)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    if (tag === "meta") {
      results.push({
        kind: "meta",
        name: getAttr(attrs, "name"),
        content: getAttr(attrs, "content"),
        property: getAttr(attrs, "property"),
        httpEquiv: getAttr(attrs, "http-equiv"),
      });
    } else {
      results.push({ kind: "link", rel: getAttr(attrs, "rel"), href: getAttr(attrs, "href"), attrs });
    }
  }

  // Paired tags: <script> and <noscript>
  const paired = /<(script|noscript)([^>]*?)>([\s\S]*?)<\/\1>/gi;
  while ((m = paired.exec(raw)) !== null) {
    const tag = m[1].toLowerCase() as "script" | "noscript";
    const attrs = m[2];
    const content = m[3].trim();
    if (tag === "noscript") {
      results.push({ kind: "noscript", content });
    } else {
      results.push({
        kind: "script",
        src: getAttr(attrs, "src"),
        content,
        async: /\basync\b/i.test(attrs),
        defer: /\bdefer\b/i.test(attrs),
      });
    }
  }

  return results;
}

function RenderHeadTags({ raw }: { raw?: string }) {
  const tags = parseHeadElements(raw || "");
  return (
    <>
      {tags.map((tag, i) => {
        if (tag.kind === "meta") {
          return (
            <meta
              key={i}
              {...(tag.name ? { name: tag.name } : {})}
              {...(tag.property ? { property: tag.property } : {})}
              {...(tag.httpEquiv ? { httpEquiv: tag.httpEquiv } : {})}
              {...(tag.content !== undefined ? { content: tag.content } : {})}
            />
          );
        }
        if (tag.kind === "link") {
          return <link key={i} rel={tag.rel} href={tag.href} />;
        }
        if (tag.kind === "noscript") {
          return <noscript key={i} dangerouslySetInnerHTML={{ __html: tag.content }} />;
        }
        if (tag.kind === "script") {
          if (tag.src) {
            return <script key={i} src={tag.src} async={tag.async} defer={tag.defer} />;
          }
          if (tag.content) {
            return <script key={i} dangerouslySetInnerHTML={{ __html: tag.content }} />;
          }
        }
        return null;
      })}
    </>
  );
}

function RenderBodyTags({ raw }: { raw?: string }) {
  const tags = parseHeadElements(raw || "").filter(
    (t) => t.kind === "script" || t.kind === "noscript"
  );
  return (
    <>
      {tags.map((tag, i) => {
        if (tag.kind === "noscript") {
          return <noscript key={i} dangerouslySetInnerHTML={{ __html: tag.content }} />;
        }
        if (tag.kind === "script") {
          if (tag.src) return <script key={i} src={tag.src} async={tag.async} defer={tag.defer} />;
          if (tag.content) return <script key={i} dangerouslySetInnerHTML={{ __html: tag.content }} />;
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
        <RenderHeadTags raw={scripts.head_priority} />
        <RenderHeadTags raw={scripts.head} />
        <RenderHeadTags raw={scripts.head_legacy} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <RenderBodyTags raw={scripts.body} />
        <RenderBodyTags raw={scripts.body_legacy} />
      </body>
    </html>
  );
}
