"""French localization and explanations for SEO alerts.

Maps each metric to a French label, severity, description (what happened
in plain language), and a recommended action. Used by both the email and
Telegram templates so a non-technical recipient understands the alert.
"""
from typing import Any, Dict


# Generic metadata per metric type. `description_tpl` is a template that
# accepts the context dict and produces a human-readable French sentence.
METRIC_INFO: Dict[str, Dict[str, str]] = {
    "keyword_position_drop": {
        "label": "Chute de position sur un mot-clé",
        "severity": "warning",
        "summary": "Un mot-clé suivi est sorti de votre seuil de position acceptable.",
        "recommendation": (
            "Vérifiez le contenu, les balises et les backlinks de la page positionnée sur ce mot-clé. "
            "Une concurrence accrue ou une modification récente peut être à l'origine de la baisse."
        ),
    },
    "traffic_drop": {
        "label": "Chute du trafic organique",
        "severity": "critical",
        "summary": "Vos sessions organiques chutent fortement par rapport à la moyenne des 7 derniers jours.",
        "recommendation": (
            "Vérifiez en priorité : disponibilité du site, indexation, robots.txt, "
            "et toute modification récente du SEO (titres, balises, redirections)."
        ),
    },
    "traffic_spike": {
        "label": "Pic de trafic organique",
        "severity": "info",
        "summary": "Vos sessions organiques sont en forte hausse par rapport à la moyenne des 7 derniers jours.",
        "recommendation": (
            "Bonne nouvelle ! Identifiez la source du pic (campagne, viralité, nouveau contenu) "
            "pour reproduire ce qui fonctionne."
        ),
    },
    "vitals_degradation": {
        "label": "Dégradation des Core Web Vitals",
        "severity": "warning",
        "summary": "Une ou plusieurs métriques de performance (LCP, CLS ou INP) sont passées dans la zone « Poor ».",
        "recommendation": (
            "Une mauvaise performance impacte directement votre SEO. Vérifiez les images lourdes, "
            "les scripts bloquants, et lancez un audit PageSpeed Insights sur la page concernée."
        ),
    },
    "seo_change_detected": {
        "label": "Modification SEO détectée",
        "severity": "warning",
        "summary": "Un élément SEO important (title, H1, balise canonique, meta description...) a changé sur une de vos pages.",
        "recommendation": (
            "Si ce changement est volontaire, ignorez cette alerte. Sinon, restaurez l'élément "
            "original immédiatement — une modification non maîtrisée peut faire chuter vos positions."
        ),
    },
    "http_error": {
        "label": "Erreur HTTP sur une page surveillée",
        "severity": "critical",
        "summary": "Une page surveillée renvoie un code d'erreur HTTP (4xx ou 5xx).",
        "recommendation": (
            "Une page en erreur perd ses positions et son trafic. Vérifiez l'URL, "
            "les redirections, et la configuration de votre serveur ou CDN."
        ),
    },
    "robots_changed": {
        "label": "Modification du fichier robots.txt",
        "severity": "warning",
        "summary": "Votre fichier robots.txt a été modifié.",
        "recommendation": (
            "Vérifiez que ce changement est intentionnel. Une mauvaise règle Disallow "
            "peut bloquer Google sur votre site entier et faire disparaître vos pages de Google."
        ),
    },
    "sitemap_url_removed": {
        "label": "URLs supprimées du sitemap",
        "severity": "warning",
        "summary": "Des URLs ont été retirées de votre sitemap XML.",
        "recommendation": (
            "Vérifiez si ces URLs sont volontairement dépubliées. Sinon, leur retrait peut "
            "provoquer une désindexation et une perte de trafic."
        ),
    },
    "indexation_error_spike": {
        "label": "Pic d'erreurs d'indexation",
        "severity": "critical",
        "summary": "Le nombre d'erreurs d'indexation détectées par Google est anormalement élevé aujourd'hui.",
        "recommendation": (
            "Consultez le rapport de couverture dans Google Search Console pour identifier "
            "les pages affectées et la nature des erreurs (404, 5xx, exclues, etc.)."
        ),
    },
    "impressions_drop": {
        "label": "Chute des impressions Google",
        "severity": "warning",
        "summary": "Vos impressions dans Google Search sont en forte baisse par rapport à la moyenne des 7 derniers jours.",
        "recommendation": (
            "Vérifiez vos positions sur vos mots-clés stratégiques et l'indexation de vos pages. "
            "Une baisse d'impressions précède souvent une chute de clics."
        ),
    },
    "clicks_drop": {
        "label": "Chute des clics Google",
        "severity": "critical",
        "summary": "Vos clics dans Google Search sont en forte baisse par rapport à la moyenne des 7 derniers jours.",
        "recommendation": (
            "Une baisse de clics impacte directement votre trafic. Vérifiez vos positions, "
            "vos balises title (qui influencent le CTR) et la présence de votre site dans Google."
        ),
    },
    "ctr_drop": {
        "label": "Chute du taux de clics (CTR)",
        "severity": "warning",
        "summary": "Votre CTR moyen sur Google a chuté de manière significative.",
        "recommendation": (
            "Améliorez vos balises title et meta description pour les rendre plus accrocheuses. "
            "Une baisse de CTR à positions équivalentes signale souvent un problème d'attractivité des snippets."
        ),
    },
    "keyword_impressions_drop": {
        "label": "Chute des impressions sur des mots-clés",
        "severity": "warning",
        "summary": "Plusieurs mots-clés perdent fortement en impressions sur les 7 derniers jours.",
        "recommendation": (
            "Vérifiez si vous avez perdu des positions sur ces requêtes ou si la demande "
            "(volume de recherche) a baissé. Auditez le contenu des pages concernées."
        ),
    },
    "keyword_clicks_drop": {
        "label": "Chute des clics sur des mots-clés",
        "severity": "critical",
        "summary": "Plusieurs mots-clés perdent fortement en clics sur les 7 derniers jours.",
        "recommendation": (
            "Ces requêtes vous apportaient du trafic. Vérifiez d'urgence vos positions et le contenu "
            "des pages qui ciblent ces mots-clés."
        ),
    },
    "page_impressions_drop": {
        "label": "Chute des impressions sur des pages",
        "severity": "warning",
        "summary": "Plusieurs pages perdent fortement en impressions sur les 7 derniers jours.",
        "recommendation": (
            "Vérifiez ces pages : modifications récentes, problèmes techniques, ou désindexation. "
            "Une page qui perd ses impressions perd souvent ses clics ensuite."
        ),
    },
    "zero_organic_pages_monthly": {
        "label": "Pages sans trafic organique sur le mois",
        "severity": "info",
        "summary": "Plusieurs pages de votre site n'ont reçu aucune visite organique ce mois-ci.",
        "recommendation": (
            "Ces pages sont peut-être mal indexées, mal positionnées, ou sans demande. "
            "Envisagez d'améliorer leur contenu, leurs balises, ou de les rediriger / supprimer."
        ),
    },
}

DEFAULT_INFO = {
    "label": "Alerte SEO",
    "severity": "warning",
    "summary": "Une anomalie a été détectée sur votre site.",
    "recommendation": "Consultez votre tableau de bord pour plus de détails.",
}

SEVERITY_COLORS = {
    "critical": "#dc2626",  # red
    "warning": "#ea580c",   # orange
    "info": "#2563eb",      # blue
}

SEVERITY_LABELS_FR = {
    "critical": "Critique",
    "warning": "Avertissement",
    "info": "Information",
}


# Frontend sub-route per metric, appended to /sites/<id>. The link target is
# chosen to land the recipient on the most relevant page for the alert.
METRIC_DASHBOARD_PATH: Dict[str, str] = {
    "keyword_position_drop": "/mots-cles",
    "keyword_impressions_drop": "/mots-cles",
    "keyword_clicks_drop": "/mots-cles",
    "traffic_drop": "/trafic",
    "traffic_spike": "/trafic",
    "impressions_drop": "/trafic",
    "clicks_drop": "/trafic",
    "ctr_drop": "/trafic",
    "page_impressions_drop": "/trafic",
    "zero_organic_pages_monthly": "/trafic",
    "vitals_degradation": "/performance",
    "seo_change_detected": "/changements-seo",
    "http_error": "/surveillance-http",
    "robots_changed": "/sitemaps",
    "sitemap_url_removed": "/sitemaps",
    "indexation_error_spike": "/indexation",
}


def dashboard_path_for(metric: str) -> str:
    return METRIC_DASHBOARD_PATH.get(metric, "")


def get_metric_info(metric: str) -> Dict[str, str]:
    return METRIC_INFO.get(metric, DEFAULT_INFO)


def format_detail_html(metric: str, context: Dict[str, Any]) -> str:
    """Return an HTML snippet (rows of a table or a list) explaining the
    metric-specific detail data. Falls back to a key/value list for unknown
    metrics."""
    if not context:
        return ""

    def row(label: str, value: Any) -> str:
        return (
            f'<tr><td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;'
            f'font-weight:600;color:#374151;width:40%">{label}</td>'
            f'<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827">{value}</td></tr>'
        )

    rows: list[str] = []

    if metric == "keyword_position_drop":
        if context.get("keyword"):
            rows.append(row(
                "Mot-clé",
                f'<span style="font-weight:700;color:#dc2626">{context["keyword"]}</span>',
            ))
        rows.append(row("Position actuelle", f"#{context.get('position')}"))
    elif metric == "traffic_drop":
        rows.append(row("Sessions aujourd'hui", f"{context.get('latest_sessions', 0):,}".replace(",", " ")))
        rows.append(row("Moyenne 7 jours", f"{context.get('avg_7d_sessions', 0):,.0f}".replace(",", " ")))
        rows.append(row("Baisse", f"-{context.get('drop_pct')} %"))
    elif metric == "traffic_spike":
        rows.append(row("Sessions aujourd'hui", f"{context.get('latest_sessions', 0):,}".replace(",", " ")))
        rows.append(row("Moyenne 7 jours", f"{context.get('avg_7d_sessions', 0):,.0f}".replace(",", " ")))
        rows.append(row("Hausse", f"+{context.get('spike_pct')} %"))
    elif metric == "impressions_drop":
        rows.append(row("Impressions hier", f"{context.get('latest_impressions', 0):,}".replace(",", " ")))
        rows.append(row("Moyenne 7 jours", f"{context.get('avg_7d_impressions', 0):,.0f}".replace(",", " ")))
        rows.append(row("Baisse", f"-{context.get('drop_pct')} %"))
    elif metric == "clicks_drop":
        rows.append(row("Clics hier", f"{context.get('latest_clicks', 0):,}".replace(",", " ")))
        rows.append(row("Moyenne 7 jours", f"{context.get('avg_7d_clicks', 0):,.0f}".replace(",", " ")))
        rows.append(row("Baisse", f"-{context.get('drop_pct')} %"))
    elif metric == "ctr_drop":
        rows.append(row("CTR actuel", f"{context.get('latest_ctr')} %"))
        rows.append(row("CTR moyen 7 jours", f"{context.get('avg_7d_ctr')} %"))
        rows.append(row("Baisse", f"-{context.get('drop_pts')} points"))
    elif metric == "vitals_degradation":
        poor = context.get("poor_metrics", [])
        readable = ", ".join(p.replace("_rating", "").upper() for p in poor) or "—"
        rows.append(row("Métriques dégradées", readable))
        if context.get("url"):
            rows.append(row("Page concernée", context["url"]))
    elif metric == "seo_change_detected":
        rows.append(row("Élément modifié", context.get("field", "—")))
        if context.get("url"):
            rows.append(row("Page concernée", context["url"]))
    elif metric == "http_error":
        rows.append(row("URL", context.get("url", "—")))
        rows.append(row("Code HTTP", context.get("status_code", "—")))
    elif metric == "robots_changed":
        rows.append(row("Modifié à", context.get("recorded_at", "—")))
    elif metric == "sitemap_url_removed":
        rows.append(row("URLs supprimées", context.get("removed_count", "—")))
    elif metric == "indexation_error_spike":
        rows.append(row("Erreurs aujourd'hui", context.get("today", "—")))
        rows.append(row("Moyenne hebdomadaire", f"{context.get('weekly_avg', 0):.1f}"))
    elif metric in ("keyword_impressions_drop", "keyword_clicks_drop"):
        rows.append(row("Mots-clés affectés", context.get("affected_count", "—")))
        rows.append(row("Période", context.get("period", "—")))
        items = context.get("keywords", [])
        if items:
            list_html = "<ul style='margin:8px 0;padding-left:20px;color:#111827'>"
            for k in items[:5]:
                if metric == "keyword_impressions_drop":
                    list_html += (
                        f"<li><b>{k['query']}</b> — {k['impressions_prev']} → {k['impressions_now']} impressions "
                        f"<span style='color:#dc2626'>(-{k['drop_pct']} %)</span></li>"
                    )
                else:
                    list_html += (
                        f"<li><b>{k['query']}</b> — {k['clicks_prev']} → {k['clicks_now']} clics "
                        f"<span style='color:#dc2626'>(-{k['drop_pct']} %)</span></li>"
                    )
            list_html += "</ul>"
            rows.append(row("Top mots-clés affectés", list_html))
    elif metric == "page_impressions_drop":
        rows.append(row("Pages affectées", context.get("affected_count", "—")))
        rows.append(row("Période", context.get("period", "—")))
        items = context.get("pages", [])
        if items:
            list_html = "<ul style='margin:8px 0;padding-left:20px;color:#111827'>"
            for p in items[:5]:
                list_html += (
                    f"<li><b>{p['page']}</b> — {p['impressions_prev']} → {p['impressions_now']} impressions "
                    f"<span style='color:#dc2626'>(-{p['drop_pct']} %)</span></li>"
                )
            list_html += "</ul>"
            rows.append(row("Top pages affectées", list_html))
    elif metric == "zero_organic_pages_monthly":
        rows.append(row("Mois", context.get("month", "—")))
        rows.append(row(
            "Pages sans trafic",
            f"{context.get('zero_organic_count', 0)} / {context.get('all_pages_count', 0)}",
        ))
        items = context.get("pages", [])
        if items:
            list_html = "<ul style='margin:8px 0;padding-left:20px;color:#111827'>"
            for p in items[:10]:
                list_html += f"<li>{p}</li>"
            if len(items) > 10:
                list_html += f"<li>… et {len(items) - 10} autres</li>"
            list_html += "</ul>"
            rows.append(row("Exemples", list_html))
    else:
        for k, v in context.items():
            rows.append(row(str(k), str(v)))

    return "".join(rows)


def format_detail_text(metric: str, context: Dict[str, Any]) -> str:
    """Plain-text French summary for Telegram/SMS."""
    if not context:
        return ""

    if metric == "keyword_position_drop":
        kw = context.get("keyword")
        if kw:
            return f'Mot-clé « {kw} » — position #{context.get("position")}'
        return f"Position actuelle : #{context.get('position')}"
    if metric == "traffic_drop":
        return (
            f"Sessions : {context.get('latest_sessions')} "
            f"(moyenne 7j : {context.get('avg_7d_sessions'):.0f}) — "
            f"Baisse de {context.get('drop_pct')} %"
        )
    if metric == "traffic_spike":
        return (
            f"Sessions : {context.get('latest_sessions')} "
            f"(moyenne 7j : {context.get('avg_7d_sessions'):.0f}) — "
            f"Hausse de +{context.get('spike_pct')} %"
        )
    if metric == "impressions_drop":
        return (
            f"Impressions : {context.get('latest_impressions'):,} "
            f"(moyenne 7j : {context.get('avg_7d_impressions'):,.0f}) — "
            f"Baisse de {context.get('drop_pct')} %"
        ).replace(",", " ")
    if metric == "clicks_drop":
        return (
            f"Clics : {context.get('latest_clicks'):,} "
            f"(moyenne 7j : {context.get('avg_7d_clicks'):,.0f}) — "
            f"Baisse de {context.get('drop_pct')} %"
        ).replace(",", " ")
    if metric == "ctr_drop":
        return (
            f"CTR : {context.get('latest_ctr')} % "
            f"(moyenne 7j : {context.get('avg_7d_ctr')} %) — "
            f"Baisse de {context.get('drop_pts')} points"
        )
    if metric == "vitals_degradation":
        poor = ", ".join(p.replace("_rating", "").upper() for p in context.get("poor_metrics", []))
        return f"Métriques dégradées : {poor or '—'} sur {context.get('url', '?')}"
    if metric == "seo_change_detected":
        return f"Élément {context.get('field')} modifié sur {context.get('url')}"
    if metric == "http_error":
        return f"{context.get('url')} renvoie HTTP {context.get('status_code')}"
    if metric == "robots_changed":
        return f"robots.txt modifié à {context.get('recorded_at')}"
    if metric == "sitemap_url_removed":
        return f"{context.get('removed_count')} URL(s) supprimée(s) du sitemap"
    if metric == "indexation_error_spike":
        return (
            f"{context.get('today')} erreurs aujourd'hui "
            f"(moyenne hebdo : {context.get('weekly_avg', 0):.1f})"
        )
    if metric in ("keyword_impressions_drop", "keyword_clicks_drop", "page_impressions_drop"):
        return f"{context.get('affected_count')} élément(s) affecté(s) sur {context.get('period')}"
    if metric == "zero_organic_pages_monthly":
        return (
            f"{context.get('zero_organic_count')} page(s) sans trafic organique "
            f"sur {context.get('all_pages_count')} en {context.get('month')}"
        )
    return ", ".join(f"{k}: {v}" for k, v in context.items())
