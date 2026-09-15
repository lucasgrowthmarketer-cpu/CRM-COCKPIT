#!/usr/bin/env python3
"""
Seed facturation — Industrial Decision Cockpit
==============================================

Cree les entreprises, opportunites et factures manquantes dans le cockpit,
via l'API REST (les regles metier du backend s'appliquent donc normalement).

Usage :
    python3 seed_facturation.py

Le script demande l'URL du backend et tes identifiants, affiche un recapitulatif,
puis demande confirmation avant d'ecrire quoi que ce soit.

Idempotent : il verifie l'existant avant chaque creation. Le relancer
n'aboutit pas a des doublons.
"""

import sys
import json
from datetime import date
from getpass import getpass

try:
    import requests
except ImportError:
    print("Module requests manquant :  pip install requests")
    sys.exit(1)


BACKEND_DEFAULT = "https://backend-production-5e8e.up.railway.app"


# ============================================================
# CONFIGURATION — ajuste ici si besoin
# ============================================================

ENTREPRISES = {
    "alma": {
        "nom": "ALMA Machines-Outils",
        "ville": "Marseille",
        "region": "Provence-Alpes-Cote d'Azur",
        "naf_code": "46.62Z",
        "site_web": "https://alma-machines-outils.fr",
        "statut_pipeline": "signe",
        "proprietaire": "lucas",
        "source": "manuel",
        "tags": ["client", "machines-outils"],
        "notes": "Client actif. Distribution machines-outils neuves, PACA et Languedoc.",
    },
    "drf": {
        "nom": "DRF Formation",
        "statut_pipeline": "signe",
        "proprietaire": "ayoub",
        "source": "manuel",
        "tags": ["client", "formation", "revops"],
        "notes": "Formation Excel certifiante financee CPF. Contact direction : Yoann.",
    },
    "fimotec": {
        "nom": "Fimotec",
        "ville": "Haguenau",
        "region": "Grand Est",
        "adresse": "20 rue Ampere, 67500 Haguenau",
        "naf_code": "46.62Z",
        "site_web": "https://vente-machine-outil.com",
        "statut_pipeline": "signe",
        "proprietaire": "lucas",
        "source": "manuel",
        "tags": ["client", "machines-outils"],
        "notes": "Refonte vente-machine-outil.com. Contact : Maxime Fischer.",
    },
    "rua": {
        # A COMPLETER : nom exact du client a verifier
        "nom": "RUA",
        "statut_pipeline": "signe",
        "proprietaire": "lucas",
        "source": "manuel",
        "tags": ["client"],
        "notes": "A completer : raison sociale exacte et coordonnees.",
    },
    "client_572": {
        # A CONFIRMER : identite du client facture 572 EUR/mois depuis aout 2026
        "nom": "Client 572 (a renommer)",
        "statut_pipeline": "signe",
        "proprietaire": "lucas",
        "source": "manuel",
        "tags": ["client", "recurrent"],
        "notes": "A completer : raison sociale exacte.",
    },
}

CONTACTS = [
    {
        "entreprise": "alma",
        "nom": "Borron", "prenom": "Jean-Baptiste",
        "titre": "Fondateur",
        "email": "jean-baptiste@alma-machines-outils.fr",
        "telephone": "+33 6 03 31 56 88",
        "decideur_niveau": "primaire",
    },
    {
        "entreprise": "drf",
        "nom": "Yoann", "titre": "Direction",
        "decideur_niveau": "primaire",
    },
    {
        "entreprise": "fimotec",
        "nom": "Fischer", "prenom": "Maxime",
        "titre": "Direction",
        "email": "fimotec@wanadoo.fr",
        "decideur_niveau": "primaire",
    },
]

OPPORTUNITES = {
    "alma_setup": {
        "entreprise": "alma",
        "intitule": "Refonte site et strategie digitale",
        "type_mission": "personnalise",
        "type_contrat": "one_shot",
        "montant_estime": 2500,
        "ca_reel_signe": 2500,
        "stade": "signe",
        "probabilite": 100,
        "proprietaire": "lucas",
        "date_signature_prevue": "2026-01-05",
    },
    "alma_recurrent": {
        "entreprise": "alma",
        "intitule": "Accompagnement mensuel SEO et contenu",
        "type_mission": "accompagnement",
        "type_contrat": "recurrent",
        "montant_estime": 385,
        "mrr": 385,
        "stade": "signe",
        "probabilite": 100,
        "proprietaire": "lucas",
        "date_debut_contrat": "2026-03-01",
        "date_fin_contrat": "2026-12-31",
    },
    "drf_setup": {
        "entreprise": "drf",
        "intitule": "Setup RevOps — HubSpot, tracking, Meta Ads",
        "type_mission": "personnalise",
        "type_contrat": "one_shot",
        "montant_estime": 1500,
        "ca_reel_signe": 1500,
        "stade": "signe",
        "probabilite": 100,
        "proprietaire": "ayoub",
        "date_signature_prevue": "2026-02-05",
    },
    "drf_recurrent": {
        "entreprise": "drf",
        "intitule": "Optimisation mensuelle — Phase B",
        "type_mission": "accompagnement",
        "type_contrat": "recurrent",
        "montant_estime": 600,
        "mrr": 600,
        "stade": "signe",
        "probabilite": 100,
        "proprietaire": "ayoub",
        "date_debut_contrat": "2026-04-01",
        "date_fin_contrat": "2026-12-31",
    },
    "fimotec_projet": {
        "entreprise": "fimotec",
        "intitule": "Refonte vente-machine-outil.com",
        "type_mission": "personnalise",
        "type_contrat": "one_shot",
        "montant_estime": 5200,
        "ca_reel_signe": 5200,
        "stade": "signe",
        "probabilite": 100,
        "proprietaire": "lucas",
        "date_signature_prevue": "2026-09-01",
    },
    "rua_projet": {
        "entreprise": "rua",
        "intitule": "Prestation ponctuelle",
        "type_mission": "one_shot",
        "type_contrat": "one_shot",
        "montant_estime": 310,
        "ca_reel_signe": 310,
        "stade": "signe",
        "probabilite": 100,
        "proprietaire": "lucas",
        "date_signature_prevue": "2026-09-01",
    },
    "client572_recurrent": {
        "entreprise": "client_572",
        "intitule": "Accompagnement mensuel",
        "type_mission": "accompagnement",
        "type_contrat": "recurrent",
        "montant_estime": 572,
        "mrr": 572,
        "stade": "signe",
        "probabilite": 100,
        "proprietaire": "lucas",
        "date_debut_contrat": "2026-08-01",
        "date_fin_contrat": "2026-12-31",
    },
}


def mois_range(debut, fin):
    """Liste des 'YYYY-MM' de debut a fin inclus."""
    y1, m1 = map(int, debut.split("-"))
    y2, m2 = map(int, fin.split("-"))
    out = []
    while (y1, m1) <= (y2, m2):
        out.append(f"{y1:04d}-{m1:02d}")
        m1 += 1
        if m1 > 12:
            m1, y1 = 1, y1 + 1
    return out


def le_5(mois):
    """Date d'emission : le 5 du mois."""
    return f"{mois}-05"


# Construction des factures
FACTURES = []

# ALMA — setup janvier
FACTURES.append({
    "opp": "alma_setup", "mois": "2026-01", "montant": 2500,
    "type": "one_shot", "statut": "payee",
    "date_emission": "2026-01-05", "date_paiement": "2026-01-05",
})

# ALMA — recurrent 385 EUR de mars a decembre
for mois in mois_range("2026-03", "2026-12"):
    if mois < "2026-09":
        statut, paiement = "payee", le_5(mois)
    elif mois == "2026-09":
        # Emise le 5 septembre, pas encore reglee
        statut, paiement = "emise", None
    else:
        statut, paiement = "prevue", None
    FACTURES.append({
        "opp": "alma_recurrent", "mois": mois, "montant": 385,
        "type": "recurrent", "statut": statut,
        "date_emission": le_5(mois) if statut != "prevue" else None,
        "date_paiement": paiement,
    })

# DRF — setup fevrier et mars (750 EUR chacun)
for mois in ["2026-02", "2026-03"]:
    FACTURES.append({
        "opp": "drf_setup", "mois": mois, "montant": 750,
        "type": "one_shot", "statut": "payee",
        "date_emission": le_5(mois), "date_paiement": le_5(mois),
    })

# DRF — recurrent 600 EUR d'avril a decembre
for mois in mois_range("2026-04", "2026-12"):
    if mois < "2026-09":
        statut, paiement = "payee", le_5(mois)
    elif mois == "2026-09":
        statut, paiement = "emise", None
    else:
        statut, paiement = "prevue", None
    FACTURES.append({
        "opp": "drf_recurrent", "mois": mois, "montant": 600,
        "type": "recurrent", "statut": statut,
        "date_emission": le_5(mois) if statut != "prevue" else None,
        "date_paiement": paiement,
    })

# Client 572 — recurrent d'aout a decembre, aout et septembre regles
for mois in mois_range("2026-08", "2026-12"):
    if mois in ("2026-08", "2026-09"):
        statut, paiement = "payee", le_5(mois)
    else:
        statut, paiement = "prevue", None
    FACTURES.append({
        "opp": "client572_recurrent", "mois": mois, "montant": 572,
        "type": "recurrent", "statut": statut,
        "date_emission": le_5(mois) if statut != "prevue" else None,
        "date_paiement": paiement,
    })

# Fimotec — projet septembre, reglement attendu semaine du 21
FACTURES.append({
    "opp": "fimotec_projet", "mois": "2026-09", "montant": 5200,
    "type": "one_shot", "statut": "emise",
    "date_emission": "2026-09-05", "date_paiement": None,
    "notes": "Reglement annonce pour la semaine du 21 septembre.",
})

# RUA — septembre, en attente, urgent
FACTURES.append({
    "opp": "rua_projet", "mois": "2026-09", "montant": 310,
    "type": "one_shot", "statut": "emise",
    "date_emission": "2026-09-05", "date_paiement": None,
    "notes": "Relance urgente.",
})


# ============================================================
# Client API
# ============================================================


class Cockpit:
    def __init__(self, base_url, token):
        self.base = base_url.rstrip("/")
        self.h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def get(self, path, **params):
        r = requests.get(f"{self.base}/api{path}", headers=self.h, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def post(self, path, payload):
        r = requests.post(f"{self.base}/api{path}", headers=self.h, json=payload, timeout=30)
        if r.status_code >= 400:
            raise RuntimeError(f"{r.status_code} sur {path} : {r.text[:300]}")
        return r.json()


def login(base_url):
    email = input("Email cockpit    : ").strip()
    password = getpass("Mot de passe     : ")
    r = requests.post(
        f"{base_url.rstrip('/')}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    if r.status_code >= 400:
        print(f"\nConnexion refusee : {r.status_code} {r.text[:200]}")
        sys.exit(1)
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if not token:
        print(f"\nToken absent de la reponse : {json.dumps(data)[:300]}")
        sys.exit(1)
    return token


def as_list(payload):
    """Le backend renvoie soit une liste, soit un objet paginé."""
    if isinstance(payload, list):
        return payload
    for key in ("items", "results", "data", "entreprises", "opportunites", "factures"):
        if isinstance(payload.get(key), list):
            return payload[key]
    return []


# ============================================================
# Execution
# ============================================================


def main():
    print("\nSeed facturation — Industrial Decision Cockpit")
    print("=" * 52)

    base = input(f"\nURL backend [{BACKEND_DEFAULT}] : ").strip() or BACKEND_DEFAULT
    token = login(base)
    api = Cockpit(base, token)
    print("Connecte.\n")

    # --- Recapitulatif avant ecriture ---
    total = sum(f["montant"] for f in FACTURES)
    encaisse = sum(f["montant"] for f in FACTURES if f["statut"] == "payee")
    attente = sum(f["montant"] for f in FACTURES if f["statut"] == "emise")
    prevu = sum(f["montant"] for f in FACTURES if f["statut"] == "prevue")

    print("Ce qui va etre cree")
    print("-" * 52)
    print(f"  Entreprises   : {len(ENTREPRISES)}")
    print(f"  Contacts      : {len(CONTACTS)}")
    print(f"  Opportunites  : {len(OPPORTUNITES)}")
    print(f"  Factures      : {len(FACTURES)}")
    print()
    print(f"  CA 2026 total : {total:>8,.0f} EUR".replace(",", " "))
    print(f"    encaisse    : {encaisse:>8,.0f} EUR".replace(",", " "))
    print(f"    en attente  : {attente:>8,.0f} EUR".replace(",", " "))
    print(f"    a venir     : {prevu:>8,.0f} EUR".replace(",", " "))
    print()

    if input("Continuer ? [o/N] ").strip().lower() not in ("o", "oui", "y"):
        print("Annule.")
        return

    # --- Entreprises ---
    print("\nEntreprises")
    existing = {e["nom"]: e["id"] for e in as_list(api.get("/entreprises"))}
    ent_ids = {}
    for key, payload in ENTREPRISES.items():
        if payload["nom"] in existing:
            ent_ids[key] = existing[payload["nom"]]
            print(f"  --  {payload['nom']} (existe deja)")
        else:
            created = api.post("/entreprises", payload)
            ent_ids[key] = created["id"]
            print(f"  OK  {payload['nom']}")

    # --- Contacts ---
    print("\nContacts")
    existing_contacts = as_list(api.get("/contacts"))
    contact_names = {(c.get("nom"), c.get("entreprise_id")) for c in existing_contacts}
    for c in CONTACTS:
        eid = ent_ids[c["entreprise"]]
        if (c["nom"], eid) in contact_names:
            print(f"  --  {c.get('prenom','')} {c['nom']} (existe deja)")
            continue
        payload = {k: v for k, v in c.items() if k != "entreprise"}
        payload["entreprise_id"] = eid
        api.post("/contacts", payload)
        print(f"  OK  {c.get('prenom','')} {c['nom']}")

    # --- Opportunites ---
    print("\nOpportunites")
    existing_opps = {o["intitule"]: o["id"] for o in as_list(api.get("/opportunites"))}
    opp_ids = {}
    for key, payload in OPPORTUNITES.items():
        if payload["intitule"] in existing_opps:
            opp_ids[key] = existing_opps[payload["intitule"]]
            print(f"  --  {payload['intitule']} (existe deja)")
            continue
        body = {k: v for k, v in payload.items() if k != "entreprise"}
        body["entreprise_id"] = ent_ids[payload["entreprise"]]
        created = api.post("/opportunites", body)
        opp_ids[key] = created["id"]
        print(f"  OK  {payload['intitule']}")

    # --- Factures ---
    print("\nFactures")
    existing_factures = as_list(api.get("/factures"))
    seen = {(f.get("opportunite_id"), f.get("mois")) for f in existing_factures}

    created_count = skipped = 0
    for f in FACTURES:
        oid = opp_ids[f["opp"]]
        if (oid, f["mois"]) in seen:
            skipped += 1
            continue
        payload = {
            "opportunite_id": oid,
            "mois": f["mois"],
            "montant": f["montant"],
            "type": f["type"],
            "statut": f["statut"],
            "date_emission": f.get("date_emission"),
            "date_paiement": f.get("date_paiement"),
            "notes": f.get("notes"),
        }
        api.post("/factures", payload)
        created_count += 1

    print(f"  OK  {created_count} factures creees")
    if skipped:
        print(f"  --  {skipped} deja presentes, ignorees")

    print("\n" + "=" * 52)
    print("Termine. Ouvre /facturation dans le cockpit pour verifier.\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrompu.")
    except Exception as e:
        print(f"\nErreur : {e}")
        sys.exit(1)
