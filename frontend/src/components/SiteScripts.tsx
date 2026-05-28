import React from "react";

const BACKEND = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

type ScriptsPayload = {
  head_priority: string;
  head: string;
  body: string;
  head_legacy: string;
  body_legacy: string;
};

async function fetchScripts(): Promise<ScriptsPayload | null> {
  try {
    const res = await fetch(`${BACKEND}/api/v1/site-scripts`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function parseAttrs(raw: string): Record<string, string | boolean> {
  const attrs: Record<string, string | boolean> = {};
  const re = /(\w[\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4];
    attrs[name] = value === undefined ? true : value;
  }
  return attrs;
}

function renderHTML(html: string, prefix: string): React.ReactNode[] {
  if (!html || !html.trim()) return [];
  const out: React.ReactNode[] = [];
  let key = 0;

  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = parseAttrs(m[1] || "");
    const inner = m[2] || "";
    const props: Record<string, unknown> = {};
    if (typeof attrs.src === "string") props.src = attrs.src;
    if (typeof attrs.type === "string") props.type = attrs.type;
    if (typeof attrs.id === "string") props.id = attrs.id;
    if (attrs.async) props.async = true;
    if (attrs.defer) props.defer = true;
    if (typeof attrs.crossorigin === "string") props.crossOrigin = attrs.crossorigin;
    if (props.src) {
      out.push(<script key={`${prefix}-s-${key++}`} {...props} />);
    } else if (inner.trim()) {
      out.push(
        <script
          key={`${prefix}-s-${key++}`}
          {...props}
          dangerouslySetInnerHTML={{ __html: inner }}
        />
      );
    }
  }

  const noscriptRe = /<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi;
  while ((m = noscriptRe.exec(html)) !== null) {
    out.push(
      <noscript
        key={`${prefix}-n-${key++}`}
        dangerouslySetInnerHTML={{ __html: m[1] || "" }}
      />
    );
  }

  const metaRe = /<meta\b([^>]*?)\/?>/gi;
  while ((m = metaRe.exec(html)) !== null) {
    const attrs = parseAttrs(m[1] || "");
    const props: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === "string") props[k === "http-equiv" ? "httpEquiv" : k] = v;
    }
    out.push(<meta key={`${prefix}-m-${key++}`} {...props} />);
  }

  const linkRe = /<link\b([^>]*?)\/?>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    const attrs = parseAttrs(m[1] || "");
    const props: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === "string") props[k] = v;
    }
    out.push(<link key={`${prefix}-l-${key++}`} {...props} />);
  }

  return out;
}

export async function SiteHeadScripts() {
  const scripts = await fetchScripts();
  if (!scripts) return null;
  const combined = [scripts.head_priority, scripts.head_legacy, scripts.head]
    .filter(Boolean)
    .join("\n");
  return <>{renderHTML(combined, "head")}</>;
}

export async function SiteBodyScripts() {
  const scripts = await fetchScripts();
  if (!scripts) return null;
  const combined = [scripts.body, scripts.body_legacy].filter(Boolean).join("\n");
  return <>{renderHTML(combined, "body")}</>;
}
