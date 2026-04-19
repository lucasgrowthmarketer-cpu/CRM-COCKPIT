# Industrial Decision Cockpit

Cockpit CRM interne pour Industrial Decision (Lucas, Ayoub, David).
Pipeline, todos hebdomadaires, objectifs financiers, suivi des prospects industriels.

**Stack** : FastAPI (Python 3.11+) + MongoDB + React 18 + Tailwind + shadcn/ui.

## Comptes seed

Trois utilisateurs créés automatiquement au premier démarrage du backend.
Mot de passe initial identique pour les trois : `industrialdecision`.
**Au premier login, chaque utilisateur est obligé de changer son mot de passe**
avant de pouvoir accéder au reste de l'application.

| Email                                  | Rôle       |
|----------------------------------------|------------|
| lucas@industrial-decision.fr           | fondateur  |
| ayoub@industrial-decision.fr           | cto        |
| david@industrial-decision.fr           | ops        |

## Setup local

### Option rapide — script automatique

```bash
chmod +x start.sh
./start.sh
```

Le script détecte si tu es sur GitHub Codespaces, configure les URLs publiques
automatiquement, lance MongoDB en Docker, installe les dépendances et te donne
les 2 commandes à lancer dans 2 terminaux.

### Setup manuel (si tu préfères)

#### Prérequis

- Python 3.11 ou +
- Node.js 18 ou +
- yarn (`npm install -g yarn` si absent)
- MongoDB — le plus simple est Docker :

```bash
docker run -d --name mongo-cockpit -p 27017:27017 mongo:7
```

Alternatives : installer MongoDB localement ou utiliser un cluster
MongoDB Atlas gratuit (mettre l'URI dans `backend/.env` à la place du
`mongodb://localhost:27017`).

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows : .venv\Scripts\activate
pip install -r requirements.txt
```

Le fichier `backend/.env` est déjà présent avec des valeurs par défaut
pour un dev local. **Avant de déployer ailleurs**, remplacer `JWT_SECRET`
par une vraie chaîne aléatoire :

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Lancer le serveur :

```bash
uvicorn server:app --reload --port 8000
```

Au premier démarrage, le seed crée automatiquement 3 utilisateurs,
8 secteurs et 3 templates email.

API docs interactives : http://localhost:8000/api/docs

### 2. Frontend

```bash
cd frontend
yarn install
yarn start
```

Ouvrir http://localhost:3000. Le `.env` pointe déjà sur
`http://localhost:8000` pour l'API.

### 3. Premier login

1. Se connecter avec `lucas@industrial-decision.fr` / `industrialdecision`
2. L'app force la redirection vers `/profil` — changer le mot de passe
3. Répéter pour `ayoub@` et `david@` si nécessaire

## Structure du repo

```
.
├── backend/
│   ├── server.py               # Un seul fichier FastAPI (1421 lignes)
│   ├── requirements.txt
│   └── .env                    # (non commité — gitignore)
├── frontend/
│   ├── src/
│   │   ├── App.js              # Routing + auth guard
│   │   ├── components/
│   │   │   ├── Layout.js       # Sidebar + topbar, must_change_password lock
│   │   │   └── ui/             # shadcn/ui primitives
│   │   ├── contexts/
│   │   │   └── AuthContext.js
│   │   ├── lib/
│   │   │   └── api.js          # Axios client + JWT interceptor
│   │   └── pages/
│   │       ├── DashboardPage.js    # KPI, funnel, MRR, à relancer
│   │       ├── EntreprisesPage.js
│   │       ├── EntrepriseDetailPage.js
│   │       ├── ContactsPage.js
│   │       ├── OpportunitesPage.js
│   │       ├── ObjectifsPage.js    # Objectifs financiers (Lucas-focused)
│   │       ├── TodosPage.js        # Kanban hebdo + bulk import
│   │       ├── SecteursPage.js
│   │       ├── ProfilPage.js       # Changement de mot de passe
│   │       └── LoginPage.js
│   ├── package.json
│   └── .env
├── data/
│   └── relances_lundi_matin.xlsx   # Pipeline Excel de référence
├── .env.example                    # Template à copier pour nouveaux setups
├── .gitignore
├── CHANGELOG-FIXES.md              # Historique des correctifs et ajouts
└── README.md
```

## Endpoints API principaux

46 routes au total, toutes préfixées `/api/`, toutes protégées par JWT sauf
`/api/auth/login`.

- **Auth** : `POST /auth/login`, `GET /auth/me`, `PUT /auth/change-password`
- **Entreprises** : CRUD + filtres (secteur, region, tags, statut,
  archived_only) + `POST /entreprises/{id}/archive` + `unarchive`
- **Contacts** : CRUD liés à une entreprise
- **Opportunités** : CRUD avec `montant_pondere` auto, contraintes
  conditionnelles `ca_reel_signe` / `motif_perdu`, MRR pour contrats récurrents
- **Interactions** : CRUD + `GET /entreprises/{id}/last-interaction`
- **Secteurs** : CRUD
- **Templates** : lecture seule (V1)
- **Objectifs** : CRUD + `GET /objectifs/actif` (un seul actif à la fois)
- **Todos** : CRUD + `POST /todos/bulk-import` (parser texte)
- **Tags** : `GET /tags` (distinct list pour filtres)
- **Dashboard** : `GET /dashboard/metrics?proprietaire=...` (KPI complets)
- **Admin** : `GET /admin/export` (dump JSON toutes collections)

## Tests rapides (une fois lancé)

```bash
# Login + récupération user
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lucas@industrial-decision.fr","password":"industrialdecision"}'

# Réponse inclut { user: { must_change_password: true, ... } }
```

## Notes de sécurité

- Les passwords sont hashés en bcrypt cost 12
- JWT expire au bout de 7 jours
- CORS whitelist via `CORS_ORIGINS` (pas de wildcard)
- `JWT_SECRET` obligatoire, le serveur refuse de démarrer sans
- `must_change_password=True` sur le seed force le changement au premier login
- Migration idempotente : si un user ancien n'a pas le flag, il est ajouté

## Backup

```bash
# Dump JSON complet (nécessite un token admin)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/admin/export > backup.json
```

À automatiser en cron hebdomadaire une fois en production.
