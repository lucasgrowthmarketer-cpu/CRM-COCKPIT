# Changelog — Fixes et ajouts vs repo Emergent initial

**Date** : 19 avril 2026
**Baseline** : repo `industrial-decision-cockpit.zip` livré par Emergent
après la prétendue livraison "Phase 2 + fixes + Phase 3".
**Objectif** : corriger les divergences entre les summaries d'Emergent et
ce qui avait réellement été codé, puis ajouter les modules V1
convenus (objectifs, todos, archives, dashboard réel).

Tous les fichiers mentionnés sont relatifs à la racine du repo.

---

## 1. Fixes de sécurité critiques

### 1.1 `backend/server.py` — JWT_SECRET obligatoire

Le fallback hardcodé `"fallback-secret-change-me"` a été supprimé.
Le serveur refuse désormais de démarrer si la variable d'environnement
`JWT_SECRET` est absente.

Expiry JWT passé de 24h à 7 jours conformément au brief v2.

### 1.2 `backend/server.py` — CORS whitelist

Le `allow_origins=["*"]` combiné à `allow_credentials=True` (non fonctionnel
en production selon la spec CORS) a été remplacé par une whitelist lue depuis
la variable `CORS_ORIGINS` (liste séparée par virgules).
Fallback `http://localhost:3000` pour dev local, avec warning.

## 2. Flux must_change_password (annoncé mais non livré par Emergent)

### 2.1 `backend/server.py` — seed des utilisateurs

Les 3 utilisateurs seedés ont désormais `must_change_password: True`.

Ajout d'une migration idempotente exécutée à chaque startup : tous les
users sans ce flag reçoivent `must_change_password: True` (protège contre
une base existante seedée avec l'ancienne version).

### 2.2 `frontend/src/App.js` — guard de redirection forcée

`ProtectedRoute` vérifie `user.must_change_password`. Si true, toute
navigation hors de `/profil` est bloquée avec un redirect automatique.

### 2.3 `frontend/src/contexts/AuthContext.js`

Ajout de la méthode `refreshUser()` exposée pour recharger l'état user
après changement de mot de passe (flippe le flag et débloque la nav).

### 2.4 `frontend/src/pages/ProfilPage.js` — nouvelle page

Page complète (203 lignes) avec :
- bannière d'alerte "Changement de mot de passe requis" quand locked
- form validé côté client (min 8 chars, ≠ `industrialdecision`, confirmation)
- appel `PUT /auth/change-password`
- refresh user + redirection vers `/` après succès

### 2.5 `frontend/src/components/Layout.js`

Les items de sidebar sont désactivés (icône cadenas, cursor not-allowed)
quand `must_change_password` est true, sauf `/profil`.

## 3. Champ propriétaire dans formulaires create (annoncé mais non livré)

### 3.1 `frontend/src/pages/EntreprisesPage.js`

- `EMPTY_FORM` inclut désormais `proprietaire: ''`
- Les deux CTA "Ajouter entreprise" (vide et principal) pré-remplissent
  `proprietaire` avec le prénom de l'utilisateur connecté
- Select propriétaire ajouté dans le Dialog à côté du Select statut pipeline
- `handleCreate` retire `proprietaire` du payload s'il est vide (laisse le
  backend appliquer le default)

### 3.2 `frontend/src/pages/OpportunitesPage.js`

Même traitement : `EMPTY_FORM` updated, deux CTA pré-remplis, Select ajouté
à côté de "Date signature prévue", payload cleanup.

## 4. Validations Pydantic renforcées

### 4.1 `backend/server.py` — types Literal pour tous les enums

Avant : tous les champs "enum" étaient des `Optional[str]`, accepte n'importe
quelle chaîne (un `statut_pipeline: "banane"` passait sans erreur).

Après : types `Literal[...]` définis en haut du fichier et réutilisés
partout. Pydantic rejette désormais toute valeur hors de la liste.

Enums ajoutés :
- `SourceT`, `StatutPipelineT`, `ProprietaireT`, `DecideurNiveauT`,
  `RoleFlagT`, `TypeMissionT`, `StadeT`, `TypeContratT`,
  `InteractionTypeT`, `InteractionStatutT`
- `TodoCategorieT`, `TodoJourT`, `TodoAssigneT`, `TodoStatutT`

### 4.2 Bornes numériques

Via `Field(ge=, le=)` :
- `probabilite` : 0 à 100 (manquait complètement)
- `authority_score` : 0 à 100
- `ca`, `effectif`, `montant_estime`, `ca_reel_signe`, `mrr`,
  `trafic_organique_mensuel`, `mots_cles_ranked` : tous ≥ 0
- `nom` entreprise et `intitule` opportunité : `min_length=1`

### 4.3 URL LinkedIn validée

Nouvelle : regex `^https?://` appliquée sur `linkedin_url` au create ET
update des contacts.

### 4.4 Site web entreprise validé en update

La regex URL sur `site_web` n'existait qu'au create, jamais en update.
Ajoutée.

### 4.5 Typo dans le message NAF

Message `"XX.XXX (ex: 28.41Z)"` corrigé en `"XX.XXA (ex: 28.41Z)"`.

## 5. Contraintes conditionnelles opportunités

### 5.1 `backend/server.py` — helper `_enforce_opportunite_stade_constraints`

Appliqué au create ET update :
- `ca_reel_signe` forcé à `null` si `stade != "signe"`
- `motif_perdu` forcé à `null` si `stade != "perdu"`
- `mrr`, `date_debut_contrat`, `date_fin_contrat` forcés à `null`
  si `type_contrat = "one_shot"`
- `mrr` requis (422) si `type_contrat = "recurrent"`

## 6. Nouveau module : Objectifs financiers (Lucas)

### 6.1 Backend — collection `objectifs`

Modèles `ObjectifCreate` / `ObjectifUpdate` avec :
- `objectif_mensuel_cible` (€ > 0, requis)
- `date_debut`, `date_cible` (ISO date)
- `objectif_mensuel_courant` (€ ≥ 0, optionnel, sinon calcul linéaire)
- `libelle`, `actif`

CRUD complet sur `/api/objectifs` + endpoint dédié `/api/objectifs/actif`.

**Logique métier** : un seul objectif actif à la fois. Quand on active un
objectif, les autres sont désactivés automatiquement.

### 6.2 Frontend — `ObjectifsPage.js`

Page CRUD complète. Bouton "Activer" sur un objectif inactif.

## 7. Nouveau module : MRR / contrats récurrents

### 7.1 Opportunités — nouveaux champs

- `type_contrat: "one_shot" | "recurrent"` (défaut `one_shot`)
- `mrr: float ≥ 0` (mensuel en euros, si récurrent)
- `date_debut_contrat`, `date_fin_contrat` (ISO date)

### 7.2 Dashboard — intégration

Calcul automatique du MRR total (somme des `mrr` des opportunités signées
récurrentes dont le contrat est actif à la date d'aujourd'hui).

Affichage :
- KPI "CA mois courant" = one-shot du mois + MRR actif
- Jauge dashboard enrichie avec détail "one-shot X + MRR Y"
- Panneau "Clients récurrents" listant chaque contrat avec son MRR
- MRR total + ARR (MRR × 12) en bas du panneau

## 8. Nouveau module : Todos hebdomadaires

### 8.1 Backend — collection `todos`

Modèles `TodoCreate` / `TodoUpdate` / `TodoBulkImport` avec :
- Catégories : `prospection`, `audit_production`, `admin`, `dev_tech`,
  `content_seo`, `autre`
- Jours : `lundi` → `vendredi`
- Assigné : `lucas` | `ayoub` (David exclu conformément à ta demande)
- Statuts : `a_faire`, `en_cours`, `termine`
- Liaisons optionnelles à une entreprise ou opportunité du pipeline

CRUD complet + endpoint bulk-import qui parse un texte collé (détecte
`-`, `*`, `1.`, `- [ ]`, etc.) et crée un todo par ligne avec valeurs
par défaut.

### 8.2 Frontend — `TodosPage.js`

- Vue kanban 5 colonnes (lun→ven) avec drag-and-drop entre jours
- Filtres par assigné et catégorie
- Statut inline-éditable sur chaque carte
- Modale bulk-import avec textarea + sélection catégorie/jour/assigné
- Liaison visuelle vers l'entreprise si rattachée

## 9. Nouveau module : Dashboard (remplace le placeholder)

### 9.1 Backend — `GET /api/dashboard/metrics`

Endpoint unique qui calcule en un appel :
- KPI cards : CA YTD, CA mois courant (inc. MRR), pipeline pondéré,
  prospects actifs, taux conversion 30j
- Chart CA signé sur 12 mois glissants
- Funnel pipeline (qualification → négociation) avec montant pondéré par stade
- Top 5 opportunités pondérées
- Liste "à relancer" (prospects actifs sans interaction > 14j)
- MRR contracts actifs

Filtre par `proprietaire` pour le toggle Dashboard "Mes données / Équipe".

### 9.2 Frontend — `DashboardPage.js`

Remplace la grille de 4 liens par un dashboard complet (401 lignes) :
- Header avec toggle "Équipe / Mes données"
- Empty state si la base est vide
- Jauge objectif (si objectif actif défini) avec barre CA signé + barre
  pipeline pondéré
- Grille de 4 KPI cards
- 2 charts côte à côte (CA 12 mois avec ligne d'objectif, funnel)
- 2 listes (top 5, à relancer)
- Panneau MRR si contrats récurrents présents

## 10. Nouveau : Archives (soft delete)

### 10.1 Backend

- Endpoint `POST /entreprises/{id}/archive` (set `archived_at`, `archived_by`)
- Endpoint `POST /entreprises/{id}/unarchive` (unset)
- `GET /entreprises` : par défaut cache les archivées
  - `?include_archived=true` pour inclure
  - `?archived_only=true` pour voir uniquement archives

### 10.2 Index MongoDB

Index `archived_at` sparse ajouté pour performance.

## 11. Nouveau : Tags libres + filtre

### 11.1 Backend

- Champ `tags: List[str]` existait déjà dans le modèle entreprise, pas exposé
- Nouveau filtre `?tags=tag1,tag2` sur `GET /entreprises`
- Nouvel endpoint `GET /api/tags` qui retourne la liste distincte
  des tags utilisés (pour populer un filtre)
- Index MongoDB sur `tags`

## 12. Nouveau : Admin export JSON

### 12.1 Backend

`GET /api/admin/export` dump toutes les collections en JSON, strip les
password_hash. Utilisable pour backup hebdomadaire ou migration.

## 13. Nettoyage config

### 13.1 `backend/.env`

- `DB_NAME` renommé de `test_database` → `industrial_decision`
- `CORS_ORIGINS` ajouté pointant sur `http://localhost:3000`
- `JWT_SECRET` maintenu (déjà présent)
- Supprimé `REACT_APP_BACKEND_URL`, `WDS_SOCKET_PORT`,
  `ENABLE_HEALTH_CHECK` qui étaient au mauvais endroit (frontend)

### 13.2 `frontend/.env`

- `REACT_APP_BACKEND_URL` pointant sur `http://localhost:8000`
  (au lieu du domaine Emergent preview)
- `WDS_SOCKET_PORT=443`, `ENABLE_HEALTH_CHECK=false` conservés

### 13.3 `.env.example` (nouveau fichier à la racine)

Template complet documentant chaque variable avec instructions de génération
du JWT_SECRET.

### 13.4 `.gitignore`

Ajout explicite de :
- `backend/.env`, `frontend/.env`, `.env`, `.env.local`, `*.env`
- Exception pour `.env.example` (commité volontairement)

## 14. Frontend — Layout et navigation

### 14.1 `components/Layout.js`

- Retrait de l'input "Rechercher..." du top bar (était câblé sur rien)
- Ajout des items de nav **Todos** (icône ClipboardList) et **Objectifs**
  (icône Flag)
- Items de nav désactivés avec icône cadenas si `must_change_password=True`

### 14.2 `App.js` — nouvelles routes

- `/objectifs` → `ObjectifsPage`
- `/todos` → `TodosPage`
- `/profil` → `ProfilPage` (était placeholder)

### 14.3 `tailwind.config.js`

Alias `jetbrains` ajouté dans `fontFamily` (utilisé dans ProfilPage pour
afficher les emails en monospace).

## 15. Validation

Smoke test réalisé sur le backend avec base mockée :
- ✓ Le module `server.py` s'importe sans erreur
- ✓ 46 routes API enregistrées
- ✓ Toutes les Pydantic model classes valident correctement
- ✓ Les enum Literal rejettent les valeurs invalides
  (ex: `statut_pipeline="banane"` → ValidationError)
- ✓ Bornes numériques enforced (probabilité > 100 rejetée, montant négatif rejeté)
- ✓ `_enforce_opportunite_stade_constraints` nullifie correctement les
  champs contraints

Vérification syntaxe frontend : les 14 fichiers JS principaux ont leurs
accolades/crochets balancés.

## 16. Nettoyage : retrait complet des références à Emergent

### 16.1 `frontend/public/index.html` — réécriture complète

Retrait de :
- Titre `Emergent | Fullstack App` → `Industrial Decision — Cockpit`
- Meta description `A product of emergent.sh`
- Script `<script src="https://assets.emergent.sh/scripts/emergent-main.js">`
- Badge flottant "Made with Emergent" (bouton noir fixé en bas à droite,
  SVG + styles inline, ~40 lignes) qui liait vers `app.emergent.sh`
- Tracker PostHog complet (`posthog.init(...)`, ~80 lignes) qui envoyait
  de la télémétrie sans consentement utilisateur
- Imports Google Fonts (`<link rel="preconnect">` + `<link href>`)

Ajouts :
- `<html lang="fr">`
- `<meta name="robots" content="noindex, nofollow">` (outil interne,
  pas d'indexation Google)
- Description française

### 16.2 Bascule sur fonts système

Avant : Manrope + Inter + JetBrains Mono chargées depuis
`fonts.googleapis.com` via `@import url(...)` dans `index.css` + `<link>`
dans `index.html`.

Après : stack de fonts système dans `tailwind.config.js` et `index.css`.
- `manrope`, `inter` → `-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif`
- `mono`, `jetbrains` → `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, ...`

Avantages :
- Zéro requête externe au chargement (privacy + perf)
- Fonctionne hors-ligne / en réseau restreint
- Identique à l'OS de l'utilisateur (lisibilité native)

Si besoin de Manrope/Inter/JetBrains en V2, utiliser `@fontsource/*`
via npm (self-hosted dans le bundle, pas de CDN).

### 16.3 `frontend/package.json`

Retrait de la dépendance `@emergentbase/visual-edits` qui pointait sur
`https://assets.emergent.sh/npm/emergentbase-visual-edits-1.0.8.tgz`
(URL externe non résolvable sans être sur Emergent).

### 16.4 `frontend/craco.config.js` — réécriture complète

Avant : 100 lignes avec `withVisualEdits`, `WebpackHealthPlugin`,
`setupHealthEndpoints` (module `plugins/health-check/` utile uniquement
pour les previews Emergent).

Après : 30 lignes, uniquement l'alias `@` → `src/` et les watchOptions
Webpack standard.

### 16.5 `frontend/plugins/health-check/` — supprimé

Plus utilisé (dépendait de `ENABLE_HEALTH_CHECK` pour le preview Emergent).

### 16.6 `frontend/.env` — simplifié

Avant : `REACT_APP_BACKEND_URL` + `WDS_SOCKET_PORT=443` +
`ENABLE_HEALTH_CHECK=false`.

Après : `REACT_APP_BACKEND_URL` uniquement. Les deux autres étaient des
hacks pour le preview Emergent (websocket HMR derrière reverse proxy HTTPS
et désactivation du healthcheck qui déclenchait des erreurs sans raison).

### 16.7 Dossier `memory/` supprimé

Contenait `PRD.md` et `test_credentials.md` — artefacts internes Emergent
non pertinents pour l'usage réel. Le CHANGELOG et le README documentent
l'historique et les credentials au bon endroit.

### 16.8 `backend/server.py`

Commentaire "seeded by earlier Emergent version without the flag"
reformulé en "seeded before this field existed".

Aucune dépendance Python à Emergent (la fausse `emergentintegrations==0.1.0`
dans `requirements.txt` avait déjà été retirée au §13).

## 17. Non inclus dans cette itération (V2)

Reporté pour une prochaine phase :
- Excel import wizard (fichier `relances_lundi_matin.xlsx` présent dans
  `/data` mais aucun endpoint ne le consomme encore)
- Pipeline kanban (sur entreprises par statut_pipeline, avec drag-and-drop)
- Templates CRUD avec éditeur markdown
- Validateur cold email (règles doctrine)
- Signals monitor (crawl périodique sites prospects)
- Séquences outreach structurées
- Notifications email de relance
- Enrichissement auto Pappers / Semrush

Ces modules restent dans la roadmap et peuvent être développés après
stabilisation de la V1 en usage réel.
