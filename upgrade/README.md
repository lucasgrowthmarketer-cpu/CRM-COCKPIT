# Upgrade — backend résilient + insights SEO

## Installer

Glisse le dossier `upgrade/` à la racine de `CRM-COCKPIT`, puis :

```bash
cd /workspaces/CRM-COCKPIT
python3 upgrade/upgrade.py
git add -A
git commit -m "feat: insights SEO + backend resilient"
git push
```

Puis sur Railway → service backend → Settings → Deploy →
**Healthcheck Path** : `/api/health`

Enfin, supprime le dossier : `rm -rf upgrade/`

---

## Ce que ça change

### Le backend ne meurt plus quand la base tousse

C'est ce qui t'a coûté trois mois. `startup` appelait `seed_data()` et les
`register_indexes` sans filet : une indisponibilité MongoDB de deux minutes
faisait sortir l'application en erreur, Railway relançait, ça re-crashait,
et le déploiement finissait purgé.

Désormais l'application démarre d'abord, puis initialise la base en tâche de
fond avec reprise automatique — 2 s, 4 s, 8 s, jusqu'à 60 s, sur 20 tentatives
(environ 15 minutes de couverture). Une coupure passagère devient un
avertissement dans les logs au lieu d'un arrêt définitif.

`GET /api/health` répond 200 tant que le service tourne et indique l'état réel
de la base dans sa réponse. À brancher comme Healthcheck Path sur Railway.

### Un onglet Synthèse

Les données brutes disent ce qui s'est passé. Cet onglet dit quoi faire.

**Ce que disent les données** — quelques phrases en français, chacune adossée à
un chiffre vérifiable dans les tables en dessous, plus l'action prioritaire du
moment avec son effort et son impact estimés.

**Où se situent vos positions** — la répartition des requêtes par tranche
(top 3, 4-10, page 2, au-delà). C'est la vue qui montre une trajectoire :
un site qui progresse voit ses requêtes remonter.

**Gains les plus accessibles** — les requêtes en page 2. Passer de la position
12 à la 8 multiplie les clics par cinq environ ; passer de 50 à 40 ne change
presque rien. C'est l'effort le plus rentable en SEO, et la colonne estime le
gain en clics.

**Bien placé, peu cliqué** — les pages qui ressortent dans Google mais dont le
taux de clic est très en dessous de ce qu'on attend à cette position. Le title
ou la meta description est en cause. Correction rapide, effet immédiat, aucun
travail technique.

**En progression / En recul** — les mouvements par rapport à la période
précédente, avec l'avant et l'après pour chaque requête. Plus les nouvelles
requêtes apparues et les pages qui bougent.

---

## Sur les estimations

Les colonnes « gain estimé » et « clics manqués » s'appuient sur une courbe de
taux de clic par position issue d'études publiques agrégées. C'est un repère
relatif, pas une promesse : les valeurs réelles varient selon le secteur, le
type de requête et la présence de blocs enrichis dans la page de résultats.
Le seuil de détection est volontairement large pour ne signaler que les écarts
vraiment marqués.

En B2B industriel, les volumes sont faibles et les pages de résultats
comportent souvent des blocs qui captent une partie des clics — les écarts y
sont structurellement plus élevés qu'en e-commerce. À présenter comme un
ordre de grandeur et une priorisation, pas comme un objectif chiffré.

---

## Nouvelle route

`GET /api/analytics/insights?period=28d&site_id=industrial`

Retourne synthèse, distribution des positions, gains accessibles,
sous-performance de CTR, et mouvements sur les requêtes et les pages.
