#!/usr/bin/env python3
"""
Import des bases prospects Lucas :
- relances_lundi_matin.xlsx (4 onglets) → Contacts (certains déjà présents)
- campagne_brevo_david_ansel.xlsx → 1 043 contacts Brevo

Règles :
- Propriétaire = lucas
- Statut "contacte" pour Relances LinkedIn / Breakup / Ré-engagement
- Statut "froid" pour Cold Emails Nouveaux et tous les Brevo
- Dédup par nom d'entreprise + email (merge sur champs vides uniquement)
- Tags par segment Brevo + source

Usage (dans backend/ avec venv actif) :
    python seed_prospects.py [--dry-run]

Idempotent : re-running n'ajoute pas de doublons.
"""
import asyncio
import os
import re
import sys
import uuid
import argparse
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
import openpyxl
from motor.motor_asyncio import AsyncIOMotorClient

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "industrial_decision")

# Files expected next to this script OR in ../data/ OR in current dir
CANDIDATE_DIRS = [ROOT, ROOT / "../data", ROOT.parent / "data", Path.cwd()]

DEPT_TO_REGION = {
    # Auvergne-Rhône-Alpes
    "01": "Auvergne-Rhone-Alpes", "03": "Auvergne-Rhone-Alpes", "07": "Auvergne-Rhone-Alpes",
    "15": "Auvergne-Rhone-Alpes", "26": "Auvergne-Rhone-Alpes", "38": "Auvergne-Rhone-Alpes",
    "42": "Auvergne-Rhone-Alpes", "43": "Auvergne-Rhone-Alpes", "63": "Auvergne-Rhone-Alpes",
    "69": "Auvergne-Rhone-Alpes", "73": "Auvergne-Rhone-Alpes", "74": "Auvergne-Rhone-Alpes",
    # Bourgogne-Franche-Comté
    "21": "Bourgogne-Franche-Comte", "25": "Bourgogne-Franche-Comte", "39": "Bourgogne-Franche-Comte",
    "58": "Bourgogne-Franche-Comte", "70": "Bourgogne-Franche-Comte", "71": "Bourgogne-Franche-Comte",
    "89": "Bourgogne-Franche-Comte", "90": "Bourgogne-Franche-Comte",
    # Bretagne
    "22": "Bretagne", "29": "Bretagne", "35": "Bretagne", "56": "Bretagne",
    # Centre-Val de Loire
    "18": "Centre-Val de Loire", "28": "Centre-Val de Loire", "36": "Centre-Val de Loire",
    "37": "Centre-Val de Loire", "41": "Centre-Val de Loire", "45": "Centre-Val de Loire",
    # Corse
    "2A": "Corse", "2B": "Corse", "20": "Corse",
    # Grand Est
    "08": "Grand Est", "10": "Grand Est", "51": "Grand Est", "52": "Grand Est",
    "54": "Grand Est", "55": "Grand Est", "57": "Grand Est", "67": "Grand Est",
    "68": "Grand Est", "88": "Grand Est",
    # Hauts-de-France
    "02": "Hauts-de-France", "59": "Hauts-de-France", "60": "Hauts-de-France",
    "62": "Hauts-de-France", "80": "Hauts-de-France",
    # Île-de-France
    "75": "Ile-de-France", "77": "Ile-de-France", "78": "Ile-de-France",
    "91": "Ile-de-France", "92": "Ile-de-France", "93": "Ile-de-France",
    "94": "Ile-de-France", "95": "Ile-de-France",
    # Normandie
    "14": "Normandie", "27": "Normandie", "50": "Normandie", "61": "Normandie", "76": "Normandie",
    # Nouvelle-Aquitaine
    "16": "Nouvelle-Aquitaine", "17": "Nouvelle-Aquitaine", "19": "Nouvelle-Aquitaine",
    "23": "Nouvelle-Aquitaine", "24": "Nouvelle-Aquitaine", "33": "Nouvelle-Aquitaine",
    "40": "Nouvelle-Aquitaine", "47": "Nouvelle-Aquitaine", "64": "Nouvelle-Aquitaine",
    "79": "Nouvelle-Aquitaine", "86": "Nouvelle-Aquitaine", "87": "Nouvelle-Aquitaine",
    # Occitanie
    "09": "Occitanie", "11": "Occitanie", "12": "Occitanie", "30": "Occitanie",
    "31": "Occitanie", "32": "Occitanie", "34": "Occitanie", "46": "Occitanie",
    "48": "Occitanie", "65": "Occitanie", "66": "Occitanie", "81": "Occitanie", "82": "Occitanie",
    # Pays de la Loire
    "44": "Pays de la Loire", "49": "Pays de la Loire", "53": "Pays de la Loire",
    "72": "Pays de la Loire", "85": "Pays de la Loire",
    # Provence-Alpes-Côte d'Azur
    "04": "Provence-Alpes-Cote d'Azur", "05": "Provence-Alpes-Cote d'Azur",
    "06": "Provence-Alpes-Cote d'Azur", "13": "Provence-Alpes-Cote d'Azur",
    "83": "Provence-Alpes-Cote d'Azur", "84": "Provence-Alpes-Cote d'Azur",
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def find_file(name):
    for d in CANDIDATE_DIRS:
        p = (d / name).resolve()
        if p.exists():
            return p
    return None


def normalize_str(s):
    """Strip + collapse whitespace."""
    if s is None:
        return ""
    s = str(s).strip()
    return re.sub(r'\s+', ' ', s)


def parse_contact_raw(raw):
    """'Antoine Cumin (DG)' → (prenom, nom, titre)."""
    if not raw:
        return (None, None, None)
    raw = normalize_str(raw)
    titre = None
    m = re.search(r'\(([^)]+)\)', raw)
    if m:
        titre = m.group(1).strip()
        raw = raw[:m.start()].strip()
    # Strip trailing ", Dr." etc.
    raw = re.sub(r',\s*(Dr|Mr|Mme|M|Mrs|Ms)\.?\s*$', '', raw, flags=re.IGNORECASE).strip()
    parts = raw.split()
    if len(parts) >= 2:
        return (parts[0], ' '.join(parts[1:]), titre)
    return (None, raw if raw else None, titre)


def valid_email(s):
    if not s:
        return None
    s = normalize_str(s).lower()
    if re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', s):
        return s
    return None


def ent_key(nom):
    """Normalized key for entreprise dedup (lowercase, collapse spaces)."""
    return normalize_str(nom).lower()


# ============================================================
# Entreprises / Contacts / Cache
# ============================================================

class ImportContext:
    def __init__(self, db, dry_run=False):
        self.db = db
        self.dry_run = dry_run
        self.ent_cache = {}  # ent_key -> {id, doc, is_new}
        self.contact_cache = {}  # (ent_id, email_or_name_key) -> contact doc
        self.stats = {
            "ent_created": 0, "ent_merged": 0,
            "contact_created": 0, "contact_merged": 0,
            "skipped": 0, "errors": 0,
        }

    async def load_existing(self):
        """Load existing entreprises into cache to avoid thousands of queries."""
        existing = await self.db.entreprises.find({}, {"_id": 0}).to_list(10000)
        for e in existing:
            self.ent_cache[ent_key(e.get("nom", ""))] = {
                "id": e["id"], "doc": e, "is_new": False
            }
        existing_c = await self.db.contacts.find({}, {"_id": 0}).to_list(10000)
        for c in existing_c:
            ent_id = c.get("entreprise_id")
            email = (c.get("email") or "").lower()
            nom = (c.get("nom") or "").lower()
            prenom = (c.get("prenom") or "").lower()
            key1 = (ent_id, f"email:{email}") if email else None
            key2 = (ent_id, f"np:{prenom}:{nom}") if nom else None
            if key1:
                self.contact_cache[key1] = c
            if key2:
                self.contact_cache[key2] = c
        print(f"  📦 Cache chargé : {len(existing)} entreprises, {len(existing_c)} contacts")

    async def upsert_entreprise(self, nom, fields=None, merge_policy="merge"):
        """Create or merge entreprise. Returns id."""
        fields = fields or {}
        nom = normalize_str(nom)
        if not nom:
            return None
        key = ent_key(nom)

        # Already in cache
        if key in self.ent_cache:
            entry = self.ent_cache[key]
            if not entry["is_new"] and merge_policy == "merge":
                # Merge: complete empty fields only, add new tags
                existing = entry["doc"]
                updates = {}
                for k, v in fields.items():
                    if v is None or v == "" or v == []:
                        continue
                    if k == "tags":
                        old_tags = set(existing.get("tags") or [])
                        new_tags = set(v)
                        merged = sorted(old_tags | new_tags)
                        if merged != sorted(old_tags):
                            updates["tags"] = merged
                    elif k == "statut_pipeline":
                        # Only upgrade status, never downgrade
                        stage_order = {"froid": 0, "qualifie": 1, "contacte": 2, "en_conversation": 3,
                                       "diagnostic_envoye": 4, "propale": 5, "signe": 6, "perdu": 0}
                        old_rank = stage_order.get(existing.get("statut_pipeline"), -1)
                        new_rank = stage_order.get(v, -1)
                        if new_rank > old_rank:
                            updates["statut_pipeline"] = v
                    elif not existing.get(k):
                        updates[k] = v
                if updates:
                    updates["updated_at"] = now_iso()
                    if not self.dry_run:
                        await self.db.entreprises.update_one({"id": entry["id"]}, {"$set": updates})
                    # Update cache
                    existing.update(updates)
                    self.stats["ent_merged"] += 1
            return entry["id"]

        # Create new
        doc = {
            "id": str(uuid.uuid4()),
            "nom": nom,
            "source": "seed_prospects",
            "proprietaire": "lucas",
            "signaux_digitaux": [],
            "tags": [],
            "statut_pipeline": "froid",
            "score_icp": 30,  # default conservative
            "created_at": now_iso(),
            "updated_at": now_iso(),
            **fields,
        }
        if not self.dry_run:
            await self.db.entreprises.insert_one(doc)
        self.ent_cache[key] = {"id": doc["id"], "doc": doc, "is_new": True}
        self.stats["ent_created"] += 1
        return doc["id"]

    async def upsert_contact(self, ent_id, fields):
        """Create or merge contact."""
        if not ent_id:
            self.stats["skipped"] += 1
            return None
        email = fields.get("email", "") or ""
        nom = (fields.get("nom") or "").lower()
        prenom = (fields.get("prenom") or "").lower()
        email_key = (ent_id, f"email:{email.lower()}") if email else None
        name_key = (ent_id, f"np:{prenom}:{nom}") if nom else None

        existing = None
        if email_key and email_key in self.contact_cache:
            existing = self.contact_cache[email_key]
        elif name_key and name_key in self.contact_cache:
            existing = self.contact_cache[name_key]

        if existing:
            updates = {}
            for k, v in fields.items():
                if v is None or v == "":
                    continue
                if not existing.get(k):
                    updates[k] = v
            if updates:
                updates["updated_at"] = now_iso()
                if not self.dry_run:
                    await self.db.contacts.update_one({"id": existing["id"]}, {"$set": updates})
                existing.update(updates)
                self.stats["contact_merged"] += 1
            return existing["id"]

        # Create new
        doc = {
            "id": str(uuid.uuid4()),
            "entreprise_id": ent_id,
            "decideur_niveau": "secondaire",
            "role_flag": "autre",
            "created_at": now_iso(),
            "updated_at": now_iso(),
            **fields,
        }
        if not self.dry_run:
            await self.db.contacts.insert_one(doc)
        if email_key:
            self.contact_cache[email_key] = doc
        if name_key:
            self.contact_cache[name_key] = doc
        self.stats["contact_created"] += 1
        return doc["id"]


# ============================================================
# Import: relances_lundi_matin.xlsx
# ============================================================

async def import_relances(ctx, path):
    """Import the 4 tabs of relances_lundi_matin.xlsx."""
    print(f"\n{'='*70}\n1) relances_lundi_matin.xlsx\n{'='*70}")
    wb = openpyxl.load_workbook(path, data_only=True)

    # Per-sheet configuration
    config = {
        "Relances LinkedIn→Email": {"statut": "contacte", "tag_extra": "relance_linkedin"},
        "Cold Emails Nouveaux":    {"statut": "froid",    "tag_extra": "cold_email"},
        "Breakup Emails":          {"statut": "contacte", "tag_extra": "breakup"},
        "Ré-engagement":           {"statut": "contacte", "tag_extra": "reengagement"},
    }

    for sheet_name, cfg in config.items():
        if sheet_name not in wb.sheetnames:
            continue
        ws = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
        if len(rows) < 2:
            continue
        headers = [normalize_str(h).lower() for h in rows[0] if h is not None]
        # Find column indices
        def col(name_options):
            for i, h in enumerate(headers):
                for opt in name_options:
                    if opt in h:
                        return i
            return None

        idx_contact = col(["contact"])
        idx_entreprise = col(["entreprise"])
        idx_email = col(["email cible", "email"])

        if idx_contact is None or idx_entreprise is None:
            print(f"  ⚠ Skip '{sheet_name}' : colonnes attendues manquantes")
            continue

        print(f"\n  📄 {sheet_name} ({len(rows)-1} lignes → statut='{cfg['statut']}')")
        created_here = 0
        merged_here = 0
        for row_num, row in enumerate(rows[1:], 2):
            try:
                nom_entreprise = normalize_str(row[idx_entreprise]) if idx_entreprise < len(row) else ""
                if not nom_entreprise:
                    continue

                # Parse contact
                raw_contact = normalize_str(row[idx_contact]) if idx_contact is not None and idx_contact < len(row) else ""
                prenom, nom, titre = parse_contact_raw(raw_contact)

                # Email
                email = None
                if idx_email is not None and idx_email < len(row):
                    email = valid_email(row[idx_email])

                # Tags for entreprise
                ent_tags = ["source:cold_outreach", f"campaign:{cfg['tag_extra']}"]

                ent_id = await ctx.upsert_entreprise(
                    nom_entreprise,
                    fields={
                        "statut_pipeline": cfg["statut"],
                        "tags": ent_tags,
                    },
                )
                if not ent_id:
                    continue

                if nom or email:
                    contact_fields = {}
                    if prenom: contact_fields["prenom"] = prenom
                    if nom: contact_fields["nom"] = nom
                    if titre: contact_fields["titre"] = titre
                    if email: contact_fields["email"] = email
                    if contact_fields.get("nom") or contact_fields.get("email"):
                        # Ensure nom is set
                        if not contact_fields.get("nom"):
                            contact_fields["nom"] = contact_fields.get("prenom") or "Contact"
                        await ctx.upsert_contact(ent_id, contact_fields)
                        created_here += 1
            except Exception as e:
                ctx.stats["errors"] += 1
                print(f"    ✗ Ligne {row_num} : {e}")

        print(f"    → {created_here} lignes traitées")


# ============================================================
# Import: campagne_brevo_david_ansel.xlsx
# ============================================================

async def import_brevo(ctx, path):
    """Import 1043 contacts from Brevo campaign file."""
    print(f"\n{'='*70}\n2) campagne_brevo_david_ansel.xlsx\n{'='*70}")
    wb = openpyxl.load_workbook(path, data_only=True)

    sheet_name = "Contacts Brevo"
    if sheet_name not in wb.sheetnames:
        print(f"  ⚠ Onglet '{sheet_name}' manquant")
        return

    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        return

    headers = [normalize_str(h).lower() if h else "" for h in rows[0]]
    print(f"  📄 Headers détectés : {headers}")

    def col(name):
        for i, h in enumerate(headers):
            if name == h:
                return i
        return None

    idx_email = col("email")
    idx_prenom = col("prenom")
    idx_nom = col("nom")
    idx_societe = col("societe")
    idx_ville = col("ville")
    idx_dept = col("dept")
    idx_segment = col("segment")

    if idx_email is None or idx_societe is None:
        print("  ⚠ Colonnes EMAIL et SOCIETE requises, skip")
        return

    print(f"\n  📄 Contacts Brevo : {len(rows)-1} lignes à traiter")
    progress_step = max(100, (len(rows) - 1) // 10)

    for row_num, row in enumerate(rows[1:], 2):
        try:
            nom_societe = normalize_str(row[idx_societe]) if idx_societe < len(row) else ""
            if not nom_societe:
                ctx.stats["skipped"] += 1
                continue

            ville = normalize_str(row[idx_ville]) if idx_ville is not None and idx_ville < len(row) else None
            dept_raw = str(row[idx_dept]).strip() if idx_dept is not None and idx_dept < len(row) and row[idx_dept] else None
            # Dept can be "95" or "2A" — normalize to 2-char
            dept = None
            if dept_raw:
                if dept_raw.isdigit():
                    dept = f"{int(dept_raw):02d}" if int(dept_raw) < 100 else dept_raw[:3]
                else:
                    dept = dept_raw.upper()
            region = DEPT_TO_REGION.get(dept) if dept else None
            segment = normalize_str(row[idx_segment]) if idx_segment is not None and idx_segment < len(row) else None

            # Build tags
            ent_tags = ["source:brevo_campagne"]
            if segment:
                # Normalize segment: "Chaudronnerie/Tôlerie" → "segment:chaudronnerie_tolerie"
                seg_norm = re.sub(r'[^a-z0-9]+', '_', segment.lower()).strip('_')
                ent_tags.append(f"segment:{seg_norm}")

            ent_fields = {
                "tags": ent_tags,
                "statut_pipeline": "froid",
            }
            if ville:
                ent_fields["ville"] = ville
            if region:
                ent_fields["region"] = region

            ent_id = await ctx.upsert_entreprise(nom_societe, fields=ent_fields)
            if not ent_id:
                continue

            # Contact
            email = valid_email(row[idx_email]) if idx_email < len(row) else None
            prenom_raw = normalize_str(row[idx_prenom]) if idx_prenom is not None and idx_prenom < len(row) else ""
            nom_raw = normalize_str(row[idx_nom]) if idx_nom is not None and idx_nom < len(row) else ""

            if prenom_raw in ("—", "-", ""):
                prenom_raw = None
            if nom_raw in ("—", "-", ""):
                nom_raw = None

            # Skip if no contact info at all
            if not email and not nom_raw:
                continue

            contact_fields = {}
            if email: contact_fields["email"] = email
            if prenom_raw: contact_fields["prenom"] = prenom_raw
            if nom_raw: contact_fields["nom"] = nom_raw
            if not contact_fields.get("nom"):
                contact_fields["nom"] = prenom_raw or "Contact"

            await ctx.upsert_contact(ent_id, contact_fields)

            if (row_num - 1) % progress_step == 0:
                print(f"    ... {row_num - 1} / {len(rows) - 1}")
        except Exception as e:
            ctx.stats["errors"] += 1
            if ctx.stats["errors"] < 10:
                print(f"    ✗ Ligne {row_num} : {e}")


# ============================================================
# Main
# ============================================================

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Simulate without writing to DB")
    parser.add_argument("--skip-relances", action="store_true")
    parser.add_argument("--skip-brevo", action="store_true")
    args = parser.parse_args()

    file_relances = find_file("relances_lundi_matin.xlsx")
    file_brevo = find_file("campagne_brevo_david_ansel.xlsx")

    if not file_relances and not args.skip_relances:
        print("✗ Fichier 'relances_lundi_matin.xlsx' introuvable")
        print(f"  Cherché dans : {[str(d) for d in CANDIDATE_DIRS]}")
        sys.exit(1)
    if not file_brevo and not args.skip_brevo:
        print("✗ Fichier 'campagne_brevo_david_ansel.xlsx' introuvable")
        sys.exit(1)

    print(f"→ MongoDB : {MONGO_URL} / db={DB_NAME}")
    if args.dry_run:
        print("→ MODE DRY-RUN : aucune écriture en base")

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    try:
        await db.command("ping")
    except Exception as e:
        print(f"✗ MongoDB inaccessible : {e}")
        sys.exit(1)

    ctx = ImportContext(db, dry_run=args.dry_run)
    await ctx.load_existing()

    if file_relances and not args.skip_relances:
        await import_relances(ctx, file_relances)

    if file_brevo and not args.skip_brevo:
        await import_brevo(ctx, file_brevo)

    print(f"\n{'='*70}\n✓ Import terminé\n{'='*70}")
    print(f"  Entreprises créées   : {ctx.stats['ent_created']}")
    print(f"  Entreprises mergées  : {ctx.stats['ent_merged']}")
    print(f"  Contacts créés       : {ctx.stats['contact_created']}")
    print(f"  Contacts mergés      : {ctx.stats['contact_merged']}")
    print(f"  Lignes ignorées      : {ctx.stats['skipped']}")
    print(f"  Erreurs              : {ctx.stats['errors']}")

    # Final stats from DB
    if not args.dry_run:
        total_ents = await db.entreprises.count_documents({})
        total_contacts = await db.contacts.count_documents({})
        lucas_froid = await db.entreprises.count_documents({"proprietaire": "lucas", "statut_pipeline": "froid"})
        lucas_contacte = await db.entreprises.count_documents({"proprietaire": "lucas", "statut_pipeline": "contacte"})
        print(f"\n  📊 État de la base après import :")
        print(f"     Total entreprises : {total_ents}")
        print(f"     Total contacts    : {total_contacts}")
        print(f"     Lucas 'froid'     : {lucas_froid}")
        print(f"     Lucas 'contacte'  : {lucas_contacte}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
