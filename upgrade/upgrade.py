#!/usr/bin/env python3
"""
Upgrade du cockpit : backend resilient + insights SEO.

A lancer depuis la racine du repo :
    python3 upgrade/upgrade.py

Idempotent : le relancer ne casse rien.

Ce que fait ce script
---------------------
1. Copie analytics_insights.py dans le backend
2. Ajoute les routes /analytics/insights au module analytics
3. Remplace AnalyticsPage.js (nouvel onglet Synthese)
4. Rend le startup de server.py resilient a une base indisponible
5. Ajoute un endpoint /api/health qui refletes l'etat reel
"""

import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
SRC = Path(__file__).parent / "files"
BACKEND = ROOT / "cockpit" / "backend"
FRONTEND = ROOT / "cockpit" / "frontend" / "src"

GREEN, YELLOW, RED, BLUE, RESET = (
    "\033[92m", "\033[93m", "\033[91m", "\033[94m", "\033[0m"
)


def ok(m): print(f"{GREEN}  OK{RESET}  {m}")
def skip(m): print(f"{YELLOW}  --{RESET}  {m}")
def fail(m): print(f"{RED}  KO{RESET}  {m}")
def step(m): print(f"\n{BLUE}{m}{RESET}")


# ============================================================
# Nouvelles routes a greffer sur analytics_module.py
# ============================================================

INSIGHTS_ROUTES = '''

# ============================================================
# Insights SEO
# ============================================================


@router.get("/insights")
async def analytics_insights(
    period: str = Query("28d"),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    """
    Lecture actionnable des donnees Search Console.

    Compare la periode demandee a la precedente pour degager les
    progressions, les chutes, les gains rapides accessibles et les
    pages qui sous-performent en taux de clic.
    """
    from analytics_insights import build_insights

    site = _get_site(site_id)
    site_url = _require_gsc(site)

    start, end = _resolve_period(period, lag=GSC_LAG_DAYS)
    prev_start, prev_end = _previous_period(start, end)

    # Les quatre jeux de donnees necessaires, en parallele
    q_curr_rows, q_prev_rows, p_curr_rows, p_prev_rows = await asyncio.gather(
        _gsc_query(site_url, start, end, dimensions=["query"], row_limit=500),
        _gsc_query(site_url, prev_start, prev_end, dimensions=["query"], row_limit=500),
        _gsc_query(site_url, start, end, dimensions=["page"], row_limit=250),
        _gsc_query(site_url, prev_start, prev_end, dimensions=["page"], row_limit=250),
    )

    overview = await gsc_overview(period, site_id, user)

    insights = build_insights(
        overview=overview,
        queries_current=_gsc_rows_to_items(q_curr_rows, "query"),
        queries_previous=_gsc_rows_to_items(q_prev_rows, "query"),
        pages_current=_gsc_rows_to_items(p_curr_rows, "page"),
        pages_previous=_gsc_rows_to_items(p_prev_rows, "page"),
    )

    return {
        "site_id": site["id"],
        "site_label": site["label"],
        "period": period,
        "range": {"start": start, "end": end},
        "previous_range": {"start": prev_start, "end": prev_end},
        "overview": overview,
        **insights,
    }
'''


# ============================================================
# Startup resilient
# ============================================================

OLD_STARTUP = '''@app.on_event("startup")
async def startup():
    await seed_data()
    await tasks_register_indexes(db)  # AJOUT - index MongoDB pour les tasks
    await analytics_register_indexes(db)
    analytics_init(db, get_current_user)
    logger.info("Industrial Decision Cockpit started")'''

NEW_STARTUP = '''# Etat d'initialisation, expose par /api/health
_init_state = {"db_ready": False, "attempts": 0, "last_error": None}


async def _deferred_init():
    """
    Initialise la base en tache de fond, avec reprise automatique.

    MongoDB peut mettre quelques secondes a accepter les connexions au
    demarrage, et peut devenir temporairement indisponible en cours de vie.
    En sortant ces operations du startup, l'application reste debout et
    retente jusqu'a ce que la base reponde, au lieu de sortir en erreur
    et d'entrainer une boucle de redemarrages.
    """
    delay = 2
    for attempt in range(1, 21):
        _init_state["attempts"] = attempt
        try:
            await db.command("ping")
            await seed_data()
            await tasks_register_indexes(db)
            await analytics_register_indexes(db)
            _init_state["db_ready"] = True
            _init_state["last_error"] = None
            logger.info(f"Initialisation MongoDB terminee (tentative {attempt})")
            return
        except Exception as e:
            _init_state["db_ready"] = False
            _init_state["last_error"] = str(e)
            logger.warning(f"Initialisation MongoDB, tentative {attempt} : {e}")
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)

    logger.error(
        "Initialisation MongoDB abandonnee. L'application reste demarree ; "
        "les routes touchant la base repondront en erreur jusqu'au retablissement."
    )


@app.on_event("startup")
async def startup():
    # N'ouvre aucune connexion : sans risque meme si la base est absente
    analytics_init(db, get_current_user)
    asyncio.create_task(_deferred_init())
    logger.info("Industrial Decision Cockpit started")


@app.get("/api/health")
async def health_check():
    """
    Etat reel du service. Utilisable comme Healthcheck Path sur Railway.

    Repond 200 tant que l'application tourne, meme si la base n'est pas
    encore prete : c'est le champ database qui porte l'information.
    """
    try:
        await db.command("ping")
        db_status = "connecte"
        _init_state["db_ready"] = True
    except Exception as e:
        db_status = f"indisponible : {e}"

    return {
        "status": "actif",
        "database": db_status,
        "initialise": _init_state["db_ready"],
        "tentatives": _init_state["attempts"],
        "derniere_erreur": _init_state["last_error"],
    }'''


def check_repo():
    step("Verification du repo")
    if not BACKEND.exists() or not FRONTEND.exists():
        fail("Lance le script depuis la racine de CRM-COCKPIT.")
        sys.exit(1)
    if not (BACKEND / "analytics_module.py").exists():
        fail("analytics_module.py absent. Installe d'abord le module analytics.")
        sys.exit(1)
    ok("Structure reconnue")


def copy_files():
    step("Copie des fichiers")
    shutil.copy(SRC / "analytics_insights.py", BACKEND / "analytics_insights.py")
    ok("cockpit/backend/analytics_insights.py")
    shutil.copy(SRC / "AnalyticsPage.js", FRONTEND / "pages" / "AnalyticsPage.js")
    ok("cockpit/frontend/src/pages/AnalyticsPage.js")


def patch_analytics_module():
    step("Routes insights")
    path = BACKEND / "analytics_module.py"
    content = path.read_text()

    if '@router.get("/insights")' in content:
        skip("Routes insights deja presentes")
        return

    anchor = "# ============================================================\n# Index Mongo\n# ============================================================"
    if anchor not in content:
        fail("Point d'insertion introuvable dans analytics_module.py")
        return

    content = content.replace(anchor, INSIGHTS_ROUTES.strip() + "\n\n\n" + anchor, 1)
    path.write_text(content)
    ok("Route /api/analytics/insights ajoutee")


def patch_server():
    step("Backend resilient")
    path = BACKEND / "server.py"
    content = path.read_text()
    changed = False

    # import asyncio
    if "\nimport asyncio" in content:
        skip("asyncio deja importe")
    else:
        anchor = "import logging"
        if anchor in content:
            content = content.replace(anchor, "import asyncio\nimport logging", 1)
            changed = True
            ok("import asyncio ajoute")
        else:
            fail("Impossible d'ajouter import asyncio")

    # startup
    if "_deferred_init" in content:
        skip("Startup deja resilient")
    elif OLD_STARTUP in content:
        content = content.replace(OLD_STARTUP, NEW_STARTUP, 1)
        changed = True
        ok("Startup rendu resilient")
        ok("Endpoint /api/health ajoute")
    else:
        fail("Bloc startup introuvable. Modifications manuelles necessaires :")
        print("      Le startup doit envelopper seed_data() et les register_indexes")
        print("      dans une tache de fond avec reprise, pour que l'application")
        print("      demarre meme si MongoDB est momentanement indisponible.")

    if changed:
        path.write_text(content)


def summary():
    step("Ensuite")
    print("""
  git add -A
  git commit -m "feat: insights SEO + backend resilient"
  git push

  Puis, sur Railway, service backend :
    Settings -> Deploy -> Healthcheck Path : /api/health
""")

    step("Ce qui change")
    print("""
  Resilience
    L'application demarre desormais meme si MongoDB ne repond pas, et
    retente l'initialisation en arriere-plan (2s, 4s, 8s... jusqu'a 60s,
    sur 20 tentatives). Une coupure passagere ne provoque plus la boucle
    de redemarrages qui avait fini par faire purger le deploiement.

  Onglet Synthese
    Une lecture en langage clair de la periode, avec l'action prioritaire
    du moment, puis quatre tables : gains rapides accessibles, pages dont
    le taux de clic sous-performe, progressions et baisses.
""")


if __name__ == "__main__":
    print("\nUpgrade du cockpit — resilience + insights")
    print("=" * 50)
    check_repo()
    copy_files()
    patch_analytics_module()
    patch_server()
    summary()
    print("=" * 50)
    print(f"{GREEN}Termine.{RESET} Verifie avec : git diff\n")
