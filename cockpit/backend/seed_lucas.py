#!/usr/bin/env python3
"""
Seed script for Lucas's real data (ALMA + DRF + Objectif annuel).

Creates:
- ALMA Machines-Outils (entreprise + contrat récurrent + factures historiques)
- DRF Formations (entreprise + 3 one-shots fév/mars/avr + contrat récurrent 600€/mois)
- Objectif actif: 3 250€ mensuel juin, 40 000€ annuel, one-shot moyen 4 250€

Le script utilise l'année civile en cours (variable YEAR dans main()).
Pour l'année prochaine, éditer cette variable.

Usage:
    cd backend && source .venv/bin/activate
    python seed_lucas.py

Idempotent: re-running won't create duplicates (matches by entreprise nom).
Supprime les données des années précédentes pour garder le dashboard propre.
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone
from pathlib import Path

# Load .env
from dotenv import load_dotenv
ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "industrial_decision")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def months_between(start, end):
    """Return list of YYYY-MM between start and end inclusive."""
    from datetime import date
    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    months = []
    y, m = s.year, s.month
    while (y, m) <= (e.year, e.month):
        months.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


async def upsert_entreprise(db, nom, **fields):
    """Find entreprise by nom, create if missing, return its id."""
    existing = await db.entreprises.find_one({"nom": nom}, {"_id": 0})
    if existing:
        print(f"  = Entreprise existante : {nom} (id={existing['id']})")
        return existing["id"]
    doc = {
        "id": str(uuid.uuid4()),
        "nom": nom,
        "source": "seed_lucas",
        "proprietaire": "lucas",
        "signaux_digitaux": [],
        "tags": [],
        "statut_pipeline": "signe",
        "score_icp": 50,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **fields,
    }
    await db.entreprises.insert_one(doc)
    print(f"  + Entreprise créée : {nom}")
    return doc["id"]


async def upsert_opportunite(db, entreprise_id, intitule, **fields):
    """Find opp by intitule+entreprise, create if missing, return its id."""
    existing = await db.opportunites.find_one(
        {"entreprise_id": entreprise_id, "intitule": intitule},
        {"_id": 0}
    )
    if existing:
        print(f"    = Opportunité existante : {intitule}")
        # Update fields if missing
        await db.opportunites.update_one(
            {"id": existing["id"]},
            {"$set": {**fields, "updated_at": now_iso()}}
        )
        return existing["id"]
    # Compute montant_pondere
    montant_estime = fields.get("montant_estime", 0) or 0
    probabilite = fields.get("probabilite", 100) or 100
    montant_pondere = montant_estime * probabilite / 100
    doc = {
        "id": str(uuid.uuid4()),
        "entreprise_id": entreprise_id,
        "intitule": intitule,
        "proprietaire": "lucas",
        "montant_pondere": montant_pondere,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **fields,
    }
    await db.opportunites.insert_one(doc)
    print(f"    + Opportunité créée : {intitule} ({montant_estime}€, {fields.get('stade', '?')})")
    return doc["id"]


async def upsert_facture(db, opportunite_id, mois, montant, type_, statut="payee"):
    """Create facture if not exists for this (opp, mois, type)."""
    existing = await db.factures.find_one({
        "opportunite_id": opportunite_id,
        "mois": mois,
        "type": type_,
    }, {"_id": 0})
    if existing:
        # Update amount/status if needed
        if existing.get("montant") != montant or existing.get("statut") != statut:
            await db.factures.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "montant": montant,
                    "statut": statut,
                    "updated_at": now_iso(),
                }}
            )
            print(f"      ~ Facture maj : {mois} {montant}€ → {statut}")
        return existing["id"]
    doc = {
        "id": str(uuid.uuid4()),
        "opportunite_id": opportunite_id,
        "mois": mois,
        "montant": montant,
        "type": type_,
        "statut": statut,
        "date_emission": f"{mois}-01" if statut in ("emise", "payee") else None,
        "date_paiement": f"{mois}-15" if statut == "payee" else None,
        "notes": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.factures.insert_one(doc)
    print(f"      + Facture créée : {mois} {montant}€ ({statut})")
    return doc["id"]


async def upsert_objectif(db, libelle, **fields):
    """Find objectif by libelle, create or update."""
    existing = await db.objectifs.find_one({"libelle": libelle}, {"_id": 0})
    if existing:
        await db.objectifs.update_one(
            {"id": existing["id"]},
            {"$set": {**fields, "updated_at": now_iso()}}
        )
        print(f"  ~ Objectif mis à jour : {libelle}")
        return existing["id"]
    # Deactivate existing active objectifs if this one will be active
    if fields.get("actif", False):
        await db.objectifs.update_many({"actif": True}, {"$set": {"actif": False}})
    doc = {
        "id": str(uuid.uuid4()),
        "libelle": libelle,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **fields,
    }
    await db.objectifs.insert_one(doc)
    print(f"  + Objectif créé : {libelle}")
    return doc["id"]


async def main():
    # ============================================================
    # Année fiscale en cours (modifier pour l'année prochaine)
    # ============================================================
    YEAR = 2026

    print(f"→ Connexion MongoDB : {MONGO_URL} / db={DB_NAME}")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    try:
        await db.command("ping")
    except Exception as e:
        print(f"✗ Impossible de se connecter à Mongo : {e}")
        sys.exit(1)

    print()
    print("=" * 60)
    print(f"1) ALMA Machines-Outils (année fiscale {YEAR})")
    print("=" * 60)

    alma_id = await upsert_entreprise(
        db, "ALMA Machines-Outils",
        ville="", region="",
        notes="Case study de référence — SEO 8→62 en 6 semaines (Lucas)",
        tags=["recurrent", "case_study"],
    )

    # Cleanup: remove factures from other years (YTD dashboard only shows current year)
    # This keeps the dashboard focused on the current fiscal year.
    cleanup_res = await db.factures.delete_many({
        "mois": {"$not": {"$regex": f"^{YEAR}-"}},
    })
    if cleanup_res.deleted_count > 0:
        print(f"  ~ Nettoyage : {cleanup_res.deleted_count} ancienne(s) facture(s) hors {YEAR} supprimée(s)")

    # Also delete ALMA/DRF opportunities from other years (recreated fresh below)
    old_opps = await db.opportunites.find({
        "intitule": {"$in": [
            "Accompagnement SEO mensuel ALMA",
            "One-shot DRF février", "One-shot DRF mars", "One-shot DRF avril",
            "Accompagnement récurrent DRF",
        ]},
        "$or": [
            {"date_debut_contrat": {"$not": {"$regex": f"^{YEAR}-"}}},
            {"date_signature_prevue": {"$not": {"$regex": f"^{YEAR}-"}}},
        ]
    }, {"_id": 0, "id": 1}).to_list(100)
    if old_opps:
        ids = [o["id"] for o in old_opps]
        await db.opportunites.delete_many({"id": {"$in": ids}})
        print(f"  ~ Nettoyage : {len(old_opps)} ancienne(s) opportunité(s) hors {YEAR} supprimée(s)")

    # Historique + récurrent ALMA :
    # 350€ jan-fév 2026 (payées), 385€ mars 2026 (payée),
    # 385€ avril 2026 (prévue - à lancer cette semaine),
    # 385€/mois mai-déc 2026 (prévues)
    alma_opp_id = await upsert_opportunite(
        db, alma_id, "Accompagnement SEO mensuel ALMA",
        type_mission="accompagnement",
        stade="signe",
        montant_estime=385,
        probabilite=100,
        ca_reel_signe=385,
        type_contrat="recurrent",
        mrr=385,
        date_debut_contrat=f"{YEAR}-01-01",
        date_fin_contrat=f"{YEAR}-12-31",
        date_signature_prevue=f"{YEAR}-01-01",
    )

    print("    Factures ALMA :")
    await upsert_facture(db, alma_opp_id, f"{YEAR}-01", 350, "recurrent", "payee")
    await upsert_facture(db, alma_opp_id, f"{YEAR}-02", 350, "recurrent", "payee")
    await upsert_facture(db, alma_opp_id, f"{YEAR}-03", 385, "recurrent", "payee")
    await upsert_facture(db, alma_opp_id, f"{YEAR}-04", 385, "recurrent", "prevue")
    for mois in months_between(f"{YEAR}-05-01", f"{YEAR}-12-31"):
        await upsert_facture(db, alma_opp_id, mois, 385, "recurrent", "prevue")

    print()
    print("=" * 60)
    print("2) DRF Formations")
    print("=" * 60)

    drf_id = await upsert_entreprise(
        db, "DRF Formations",
        tags=["one_shot_historique", "recurrent"],
    )

    # Trois one-shots 750€ en fév, mars, avril
    drf_oneshot_feb = await upsert_opportunite(
        db, drf_id, "One-shot DRF février",
        type_mission="audit_drs",
        stade="signe",
        montant_estime=750,
        probabilite=100,
        ca_reel_signe=750,
        type_contrat="one_shot",
        date_signature_prevue=f"{YEAR}-02-15",
    )
    await upsert_facture(db, drf_oneshot_feb, f"{YEAR}-02", 750, "one_shot", "payee")

    drf_oneshot_mar = await upsert_opportunite(
        db, drf_id, "One-shot DRF mars",
        type_mission="audit_drs",
        stade="signe",
        montant_estime=750,
        probabilite=100,
        ca_reel_signe=750,
        type_contrat="one_shot",
        date_signature_prevue=f"{YEAR}-03-15",
    )
    await upsert_facture(db, drf_oneshot_mar, f"{YEAR}-03", 750, "one_shot", "payee")

    drf_oneshot_avr = await upsert_opportunite(
        db, drf_id, "One-shot DRF avril",
        type_mission="audit_drs",
        stade="signe",
        montant_estime=750,
        probabilite=100,
        ca_reel_signe=750,
        type_contrat="one_shot",
        date_signature_prevue=f"{YEAR}-04-15",
    )
    # Avril: one-shot 750 à facturer cette semaine (prévue)
    await upsert_facture(db, drf_oneshot_avr, f"{YEAR}-04", 750, "one_shot", "prevue")

    # Récurrent DRF: 600€/mois à partir d'avril, facturé le 5 du mois suivant
    drf_recurrent_id = await upsert_opportunite(
        db, drf_id, "Accompagnement récurrent DRF",
        type_mission="accompagnement",
        stade="signe",
        montant_estime=600,
        probabilite=100,
        ca_reel_signe=600,
        type_contrat="recurrent",
        mrr=600,
        date_debut_contrat=f"{YEAR}-04-01",
        date_fin_contrat=f"{YEAR}-12-31",
        date_signature_prevue=f"{YEAR}-04-01",
    )
    # Avril → décembre en prévue (première mensualité avril facturée 5 mai)
    for mois in months_between(f"{YEAR}-04-01", f"{YEAR}-12-31"):
        await upsert_facture(db, drf_recurrent_id, mois, 600, "recurrent", "prevue")

    print()
    print("=" * 60)
    print(f"3) Objectif Lucas {YEAR}")
    print("=" * 60)

    # Cleanup: deactivate and delete old objectifs named "Objectif Lucas XXXX" for other years
    old_objectifs = await db.objectifs.find({
        "libelle": {"$regex": r"^Objectif Lucas \d{4}$", "$ne": f"Objectif Lucas {YEAR}"}
    }, {"_id": 0, "id": 1, "libelle": 1}).to_list(20)
    if old_objectifs:
        ids = [o["id"] for o in old_objectifs]
        await db.objectifs.delete_many({"id": {"$in": ids}})
        print(f"  ~ Nettoyage : {len(old_objectifs)} ancien(s) objectif(s) supprimé(s) ({', '.join(o['libelle'] for o in old_objectifs)})")

    await upsert_objectif(
        db, f"Objectif Lucas {YEAR}",
        objectif_mensuel_cible=3250,
        objectif_mensuel_courant=985,  # MRR courant (385 ALMA + 600 DRF)
        objectif_annuel_cible=40000,
        one_shot_moyen=4250,
        date_debut=f"{YEAR}-01-01",
        date_cible=f"{YEAR}-06-30",
        actif=True,
    )

    print()
    print("=" * 60)
    print("✓ Seed terminé")
    print("=" * 60)

    # Summary
    ent_count = await db.entreprises.count_documents({})
    opp_count = await db.opportunites.count_documents({})
    fac_count = await db.factures.count_documents({})
    fac_payee = await db.factures.count_documents({"statut": "payee"})
    fac_prevue = await db.factures.count_documents({"statut": "prevue"})
    print(f"  Entreprises totales : {ent_count}")
    print(f"  Opportunités totales: {opp_count}")
    print(f"  Factures totales    : {fac_count} ({fac_payee} payées, {fac_prevue} prévues)")

    # Compute total expected current year
    facs = await db.factures.find({"mois": {"$regex": f"^{YEAR}"}}, {"_id": 0}).to_list(1000)
    total_year = sum(f["montant"] for f in facs if f.get("statut") != "annulee")
    total_payee = sum(f["montant"] for f in facs if f.get("statut") == "payee")
    total_prevu = sum(f["montant"] for f in facs if f.get("statut") == "prevue")
    print(f"  CA {YEAR} total        : {total_year:.0f}€ ({total_payee:.0f}€ payé + {total_prevu:.0f}€ prévu)")
    print(f"  Vs objectif 40 000€ : manque {max(0, 40000 - total_year):.0f}€ soit {(40000-total_year)/4250:.1f} one-shots à 4 250€")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
