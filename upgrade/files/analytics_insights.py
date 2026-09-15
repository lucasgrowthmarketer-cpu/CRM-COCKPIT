"""
Insights SEO - Industrial Decision Cockpit
==========================================

Transforme les donnees brutes de Search Console en lecture actionnable.

Importe par analytics_module.py. Ne definit pas de router propre :
les routes sont exposees depuis analytics_module.

Ce que ce module calcule
------------------------
1. Distribution des positions      ou en est le site globalement
2. Quick wins                      requetes en page 2, proches du top 10
3. CTR sous-performant             bonne position, mauvais taux de clic
4. Mouvements                      progressions et chutes vs periode precedente
5. Requetes gagnees / perdues      apparitions et disparitions
6. Synthese en langage clair       de quoi ouvrir une reunion client
"""

from typing import List, Dict, Any, Optional

# ============================================================
# Courbe de CTR de reference par position
# ============================================================
# Ordres de grandeur issus d'etudes publiques agregees sur la SERP Google.
# Sert uniquement de repere relatif : un ecart important entre le CTR reel
# et cette reference signale un title ou une meta description a retravailler.
# Les valeurs varient selon le secteur et le type de requete, d'ou l'usage
# d'un seuil de tolerance genereux avant de signaler quoi que ce soit.

CTR_BENCHMARK = {
    1: 28.0, 2: 15.0, 3: 11.0, 4: 8.0, 5: 7.0,
    6: 5.0, 7: 4.0, 8: 3.5, 9: 3.0, 10: 2.5,
}
CTR_PAGE2 = 1.5   # positions 11 a 20
CTR_BEYOND = 0.5  # au-dela de 20


def expected_ctr(position: float) -> float:
    """CTR attendu pour une position donnee."""
    if position <= 10:
        return CTR_BENCHMARK.get(int(round(position)) or 1, 2.5)
    if position <= 20:
        return CTR_PAGE2
    return CTR_BEYOND


# ============================================================
# Distribution des positions
# ============================================================

POSITION_BUCKETS = [
    ("top3", "Top 3", 1, 3),
    ("top10", "Positions 4-10", 4, 10),
    ("page2", "Page 2 (11-20)", 11, 20),
    ("page3", "Positions 21-50", 21, 50),
    ("beyond", "Au-dela de 50", 51, 1000),
]


def build_position_distribution(queries: List[Dict]) -> List[Dict]:
    """
    Repartit les requetes par tranche de position.

    C'est la vue qui repond a « ou en est le site ? » en un coup d'oeil :
    un site en croissance voit ses requetes migrer vers le haut du tableau.
    """
    out = []
    total = len(queries) or 1

    for key, label, lo, hi in POSITION_BUCKETS:
        bucket = [q for q in queries if lo <= q["position"] <= hi]
        clicks = sum(q["clicks"] for q in bucket)
        impressions = sum(q["impressions"] for q in bucket)
        out.append({
            "key": key,
            "label": label,
            "queries": len(bucket),
            "share": round(len(bucket) / total * 100, 1),
            "clicks": clicks,
            "impressions": impressions,
        })
    return out


# ============================================================
# Quick wins
# ============================================================


def build_quick_wins(queries: List[Dict], limit: int = 15) -> List[Dict]:
    """
    Requetes en page 2 avec du volume : l'effort le plus rentable en SEO.

    Passer de la position 12 a la position 8 multiplie les clics par cinq
    environ, alors que passer de 50 a 40 ne change presque rien. Ces requetes
    sont deja comprises par Google, il ne manque que quelques signaux.

    potential_clicks estime ce que rapporterait un passage en position 7-8.
    """
    candidates = [
        q for q in queries
        if 11 <= q["position"] <= 20 and q["impressions"] >= 20
    ]

    for q in candidates:
        target_ctr = CTR_BENCHMARK[8]
        q["potential_clicks"] = max(
            0, int(q["impressions"] * target_ctr / 100) - q["clicks"]
        )
        q["distance_to_page1"] = round(q["position"] - 10, 1)

    candidates.sort(key=lambda q: q["potential_clicks"], reverse=True)
    return candidates[:limit]


# ============================================================
# CTR sous-performant
# ============================================================


def build_ctr_underperformers(queries: List[Dict], limit: int = 15) -> List[Dict]:
    """
    Requetes bien positionnees mais peu cliquees.

    Position correcte et CTR tres en dessous du repere : la page ressort
    dans les resultats mais son title ou sa meta description ne donne pas
    envie de cliquer. Correction rapide, effet immediat, aucun travail
    technique ni de netlinking.
    """
    out = []
    for q in queries:
        if q["position"] > 10 or q["impressions"] < 30:
            continue
        expected = expected_ctr(q["position"])
        # Seuil genereux : on ne signale que les ecarts vraiment marques
        if q["ctr"] >= expected * 0.5:
            continue

        gap = expected - q["ctr"]
        out.append({
            **q,
            "expected_ctr": expected,
            "ctr_gap": round(gap, 2),
            "missed_clicks": int(q["impressions"] * gap / 100),
        })

    out.sort(key=lambda q: q["missed_clicks"], reverse=True)
    return out[:limit]


# ============================================================
# Mouvements entre deux periodes
# ============================================================


def compare_periods(
    current: List[Dict],
    previous: List[Dict],
    key: str,
    min_impressions: int = 20,
) -> Dict[str, List[Dict]]:
    """
    Compare deux periodes sur une dimension (query ou page).

    Retourne les progressions, les chutes, les apparitions et les
    disparitions. C'est ce qui permet de raconter une evolution
    plutot que de decrire un etat.
    """
    prev_map = {p[key]: p for p in previous}
    curr_map = {c[key]: c for c in current}

    rising, falling, gained = [], [], []

    for name, curr in curr_map.items():
        prev = prev_map.get(name)

        if prev is None:
            if curr["impressions"] >= min_impressions:
                gained.append({**curr, "status": "nouvelle"})
            continue

        clicks_delta = curr["clicks"] - prev["clicks"]
        position_delta = round(prev["position"] - curr["position"], 1)

        entry = {
            **curr,
            "previous_clicks": prev["clicks"],
            "previous_position": prev["position"],
            "clicks_delta": clicks_delta,
            "position_delta": position_delta,
        }

        # Progression significative : gain de clics ou de position
        if clicks_delta > 0 and (clicks_delta >= 3 or position_delta >= 2):
            rising.append(entry)
        elif clicks_delta < 0 and (clicks_delta <= -3 or position_delta <= -2):
            falling.append(entry)

    lost = [
        {**prev, "status": "perdue"}
        for name, prev in prev_map.items()
        if name not in curr_map and prev["impressions"] >= min_impressions
    ]

    rising.sort(key=lambda x: x["clicks_delta"], reverse=True)
    falling.sort(key=lambda x: x["clicks_delta"])
    gained.sort(key=lambda x: x["impressions"], reverse=True)
    lost.sort(key=lambda x: x["clicks"], reverse=True)

    return {
        "rising": rising[:12],
        "falling": falling[:12],
        "gained": gained[:12],
        "lost": lost[:12],
    }


# ============================================================
# Synthese en langage clair
# ============================================================


def build_summary(
    overview: Dict[str, Any],
    distribution: List[Dict],
    quick_wins: List[Dict],
    underperformers: List[Dict],
    query_moves: Dict[str, List],
) -> Dict[str, Any]:
    """
    Quelques phrases exploitables telles quelles en reunion.

    Chaque constat est rattache a un chiffre verifiable dans les tables
    en dessous : rien n'est affirme sans que la donnee soit consultable.
    """
    lines = []
    current = overview.get("current", {})
    delta = overview.get("delta", {})

    clicks = current.get("clicks", 0)
    impressions = current.get("impressions", 0)
    clicks_delta = delta.get("clicks")
    position = current.get("position", 0)

    # Tendance generale
    if clicks_delta is None:
        lines.append(
            f"{clicks} clics pour {impressions} impressions sur la periode. "
            "Pas encore de periode precedente comparable."
        )
    elif clicks_delta > 10:
        lines.append(
            f"Le trafic de recherche progresse de {clicks_delta} % "
            f"avec {clicks} clics sur la periode."
        )
    elif clicks_delta < -10:
        lines.append(
            f"Le trafic de recherche recule de {abs(clicks_delta)} % "
            f"avec {clicks} clics sur la periode."
        )
    else:
        lines.append(
            f"Le trafic reste stable autour de {clicks} clics "
            f"pour {impressions} impressions."
        )

    # Position moyenne
    if position:
        if position <= 10:
            lines.append(
                f"La position moyenne est de {position}, soit la premiere page."
            )
        elif position <= 20:
            lines.append(
                f"La position moyenne de {position} place le site en deuxieme page : "
                "la visibilite existe mais convertit peu en clics."
            )
        else:
            lines.append(
                f"La position moyenne de {position} reste eloignee de la premiere page."
            )

    # Distribution
    top3 = next((b for b in distribution if b["key"] == "top3"), None)
    page2 = next((b for b in distribution if b["key"] == "page2"), None)
    if top3 and top3["queries"]:
        lines.append(
            f"{top3['queries']} requetes sont en top 3 et generent "
            f"{top3['clicks']} clics."
        )

    # Quick wins
    if quick_wins:
        total_potential = sum(q["potential_clicks"] for q in quick_wins)
        if total_potential > 0:
            lines.append(
                f"{len(quick_wins)} requetes se trouvent en page 2 ; les faire passer "
                f"en premiere page representerait environ {total_potential} clics "
                "supplementaires par periode."
            )

    # CTR
    if underperformers:
        missed = sum(u["missed_clicks"] for u in underperformers)
        if missed > 0:
            lines.append(
                f"{len(underperformers)} pages bien positionnees obtiennent moins de "
                f"clics qu'attendu : environ {missed} clics perdus, recuperables en "
                "retravaillant titles et meta descriptions."
            )

    # Mouvements
    rising = query_moves.get("rising", [])
    falling = query_moves.get("falling", [])
    if rising:
        top = rising[0]
        lines.append(
            f"Meilleure progression : « {top['query']} », "
            f"{top['clicks_delta']:+d} clics."
        )
    if falling:
        top = falling[0]
        lines.append(
            f"Principale baisse : « {top['query']} », "
            f"{top['clicks_delta']:+d} clics."
        )

    # Priorite d'action
    priority = None
    if underperformers and sum(u["missed_clicks"] for u in underperformers) > 20:
        priority = {
            "action": "Retravailler les titles et meta descriptions",
            "why": "Des pages deja bien positionnees ne convertissent pas leurs impressions en clics.",
            "effort": "Faible",
            "impact": "Rapide",
        }
    elif quick_wins and sum(q["potential_clicks"] for q in quick_wins) > 20:
        priority = {
            "action": "Renforcer les pages en page 2",
            "why": "Quelques positions gagnees suffisent a multiplier les clics sur ces requetes.",
            "effort": "Moyen",
            "impact": "Fort",
        }
    elif falling:
        priority = {
            "action": "Analyser les pages en recul",
            "why": "Des requetes perdent du trafic : contenu date ou concurrence accrue.",
            "effort": "Moyen",
            "impact": "Defensif",
        }
    elif clicks_delta is not None and clicks_delta > 10:
        priority = {
            "action": "Amplifier ce qui fonctionne",
            "why": "La dynamique est bonne : dupliquer le format des pages qui progressent.",
            "effort": "Moyen",
            "impact": "Cumulatif",
        }

    return {"lines": lines, "priority": priority}


# ============================================================
# Assemblage
# ============================================================


def build_insights(
    overview: Dict[str, Any],
    queries_current: List[Dict],
    queries_previous: List[Dict],
    pages_current: List[Dict],
    pages_previous: List[Dict],
) -> Dict[str, Any]:
    """Assemble l'ensemble des analyses en une reponse unique."""
    distribution = build_position_distribution(queries_current)
    quick_wins = build_quick_wins(queries_current)
    underperformers = build_ctr_underperformers(queries_current)
    query_moves = compare_periods(queries_current, queries_previous, "query")
    page_moves = compare_periods(pages_current, pages_previous, "page")

    summary = build_summary(
        overview, distribution, quick_wins, underperformers, query_moves
    )

    return {
        "summary": summary,
        "position_distribution": distribution,
        "quick_wins": quick_wins,
        "ctr_underperformers": underperformers,
        "query_moves": query_moves,
        "page_moves": page_moves,
        "totals": {
            "queries_tracked": len(queries_current),
            "pages_tracked": len(pages_current),
            "quick_wins_count": len(quick_wins),
            "quick_wins_potential": sum(q["potential_clicks"] for q in quick_wins),
            "missed_clicks": sum(u["missed_clicks"] for u in underperformers),
        },
    }
