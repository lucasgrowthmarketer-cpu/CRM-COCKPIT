# Changelog V5 — Données Lucas + refonte Dashboard

**Date** : 20 avril 2026
**Objectif** : transformer le cockpit d'outil CRM générique en tableau de bord
financier exploitable par Lucas au quotidien, avec suivi des contrats récurrents
ALMA et DRF, et objectifs 2025.

---

## Nouveautés

### 1. Module Factures (backend)

Nouvelle collection `factures` indépendante des opportunités. Chaque facture :
- Rattachée à une opportunité (`opportunite_id`)
- Identifiée par un mois (`mois` format `YYYY-MM`)
- Montant (`montant`) et type (`recurrent` / `one_shot`)
- Statut : `prevue` → `emise` → `payee`, ou `annulee`

**Pourquoi** : avant on n'avait qu'un `mrr` fixe sur l'opportunité. Impossible
de distinguer "ce qui a été vraiment payé" de "ce qui est projeté". Les factures
permettent de construire un CA mensuel **réel** basé sur les paiements reçus,
et une projection fiable du reste de l'année.

**Endpoints** (6 nouveaux) :
- `POST /api/factures` — créer manuellement
- `GET /api/factures` — lister avec filtres (opp, statut, mois)
- `GET /api/factures/{id}` — détail
- `PUT /api/factures/{id}` — modifier (auto-set dates sur changement statut)
- `DELETE /api/factures/{id}` — supprimer
- `GET /api/factures/by-opportunite/{id}` — historique d'un contrat
- `POST /api/opportunites/{id}/generate-factures` — régénérer les prévisions
  manquantes pour un contrat récurrent

**Auto-génération** : quand on crée une opportunité récurrente, la fonction
`_generate_recurring_factures()` crée automatiquement les factures
prévisionnelles de `date_debut_contrat` à `date_fin_contrat` (une par mois).

### 2. Dashboard refondu

Endpoint `/api/dashboard/metrics` entièrement repensé :

**Paramètre `mode`** :
- `equipe` (défaut) : aucune restriction
- `mes_donnees` : filtré sur l'utilisateur connecté
- `lucas_personnel` : force `proprietaire=lucas` quel que soit l'utilisateur
  connecté (car Ayoub/David regardent aussi et doivent voir la perf de Lucas)

**Nouveaux blocs de données renvoyés** :
- `objectif` — avec `ca_ytd`, `ca_prevu_reste_annee`, `manquant`,
  `one_shots_requis`, `pct_realise`, `pct_projete` calculés automatiquement
  à partir des factures
- `one_shot_tracker` — dernier one-shot signé, jours depuis, cible J+60, jours
  jusqu'à cible
- `notifications` — alertes in-app (ex: factures du mois dernier pas émises)
- `chart_ca_par_mois` — désormais ventile `realise` (payé+émis) vs `prevu`
  par mois, avec flags `is_past` / `is_current`

### 3. Modèle Objectif enrichi

Nouveaux champs :
- `objectif_annuel_cible` (optionnel, sinon mensuel × 12 par défaut)
- `one_shot_moyen` (pour calculer "combien de deals pour atteindre le 40k")

Formulaire `ObjectifsPage` mis à jour en conséquence.

### 4. Dashboard frontend — 8 nouveaux widgets

Toute la page `DashboardPage.js` réécrite (750 lignes). De haut en bas :

**a. Toggle 3 positions** — Équipe / Mes données / Lucas personnel

**b. Bannière de notifications** — alertes jaunes quand factures à émettre

**c. Ligne de vie MRR** (widget bleu dégradé) — MRR actuel vs cible mensuelle
   avec barre de progression, pourcentage, montant manquant

**d. Rangée de 4 KPI** — CA YTD, CA ce mois, Pipeline pondéré, Conversion 30j

**e. CA manquant pour l'objectif annuel** — deux barres (réalisé + projeté),
   badge "N one-shots requis à 4 250€"

**f. Prochain one-shot** (compte à rebours) — dernier signé, cible J+60,
   alerte si en retard

**g. Graphe CA mensuel 2025** — ventilation `réalisé` (vert) vs `prévu` (bleu
   transparent), ligne horizontale rouge à la cible mensuelle

**h. Contrats récurrents cliquables** — chaque contrat ouvre un dialog
   avec l'historique mois par mois, actions "Émettre" / "Encaisser"

**i. Funnel pipeline** — barres horizontales par stade

**j. Top 5 opps + À relancer** (préservés de V4)

### 5. Dialog détail contrat récurrent

Clic sur un contrat dans le panneau MRR ouvre une fenêtre :
- Résumé Payé / Émis / Prévu
- Liste mois par mois avec statut (badge coloré)
- Bouton "Émettre" (sur prévue) et "Encaisser" (sur prévue/émise)
- Auto-refresh du dashboard après action

### 6. Raccourcis clavier globaux

Style Gmail/Linear. Hook `useKeyboardShortcuts.js` plugué dans Layout.

- `G D` → Dashboard
- `G P` → Pipeline
- `G T` → Todos
- `G E` → Entreprises
- `G C` → Contacts
- `G O` → Opportunités
- `G F` → Objectifs
- `G M` → Templates (Mail)
- `G I` → Import
- `G S` → Secteurs
- `/` → Focus la barre de recherche de la page
- `?` → Ouvre la modale d'aide

### 7. Mode sombre

- Toggle soleil/lune dans le header (à côté de l'avatar)
- Persistance dans `localStorage['cockpit_theme']`
- Détection auto du `prefers-color-scheme` au premier chargement
- Context React (`ThemeContext.js`) + classe `.dark` sur `<html>`
- CSS variables light/dark dans `index.css`
- Overrides CSS globaux pour éviter de refactorer chaque page individuellement

### 8. Badge notifications sur sidebar

Le Layout polle `/api/dashboard/metrics` toutes les 60s et affiche un petit
badge rouge sur l'item "Dashboard" quand il y a des notifications actives
(ex: factures du mois dernier à émettre).

### 9. Script de seed Lucas

`backend/seed_lucas.py` — à lancer une fois après le premier démarrage du
backend. Idempotent (les re-runs ne créent pas de doublons). Insère :

**ALMA Machines-Outils** :
- Entreprise créée (statut signé, propriétaire Lucas, tags `recurrent + case_study`)
- Opportunité "Accompagnement SEO mensuel ALMA" récurrente, MRR 385€,
  contrat 2025-01-01 → 2025-12-31
- Factures : 350€ payée (jan), 350€ payée (fév), 385€ payée (mars),
  385€ prévue (avril → à émettre cette semaine), 385€ prévues mai→déc

**DRF Formations** :
- Entreprise créée
- 3 one-shots 750€ : février payée, mars payée, avril prévue
- Opportunité "Accompagnement récurrent DRF" récurrente, MRR 600€,
  contrat 2025-04-01 → 2025-12-31
- Factures récurrentes 600€ prévues avril→décembre

**Objectif Lucas 2025** :
- Mensuel cible : 3 250€ (cible juin 2025)
- Annuel cible : 40 000€
- One-shot moyen : 4 250€
- Actif = true

Usage :
```bash
cd backend
source .venv/bin/activate
python seed_lucas.py
```

---

## Résumé technique

**Backend** : 2439 lignes (+380 vs V4), 60 routes API (+6 factures + 1 generate-factures),
1 nouvelle collection (`factures`), 2 nouveaux champs sur Objectif.

**Frontend** : 3 nouveaux fichiers (`ThemeContext.js`, `useKeyboardShortcuts.js`,
`DashboardPage.js` réécrit), Layout entièrement refait avec théme+raccourcis+notifs.

**Validation** :
- Syntax Python OK sur server.py et seed_lucas.py
- Babel JSX compile OK sur les 14 pages + Layout + App + ThemeContext + hooks
- Zero import manquant détecté par audit statique
- 60 routes API enregistrées dont les 6 nouvelles factures

---

## Chantiers reportés en V6

Conformément à notre discussion avant Railway :
- Backup auto nightly via cron
- Healthcheck `/api/health` + logs structurés
- Rate limiting sur `/api/auth/login`
- Build frontend servi par backend (single Railway service)
- JWT secret production + MongoDB Atlas
- Recherche globale Cmd+K (`cmdk` déjà dans les deps)
