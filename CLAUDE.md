# CLAUDE.md — « LifeHub » (nom provisoire) : PWA de centralisation perso

> Tu es un développeur full-stack sénior + expert cybersécurité. Tu construis cette app **phase par phase**, vite, avec un MVP utilisable à la fin de chaque phase avant de polir. Langue de l'UI : **français**. Monnaie : **FCFA (XOF)**, entiers uniquement.

## 1. Objectif

Une PWA installable (téléphone + PC), **offline-first**, qui centralise la vie quotidienne d'un seul utilisateur principal (l'admin) :

1. **Habit tracker** mensuel (inspiré d'un template Excel : grille à cocher, % par jour/semaine, anneau global, top habitudes, humeur + heures de sommeil).
2. **Tracker de dépenses** (saisie en 2 taps, catégories, budget mensuel, graphiques).
3. **Objectifs du jour + tâches** (priorités, échéances, récurrence).
4. **Maison** : menu de la semaine, stock (« il reste quoi »), factures à payer, liste de courses. **Partageable avec des colocs, géré uniquement par l'admin.**
5. **Écran « Aujourd'hui »** : vue unique agrégeant habitudes du jour, tâches, factures proches, dépense du jour.

Fonctionne hors ligne ; dès que le réseau revient, tout se synchronise automatiquement.

## 2. Stack et contraintes (non négociables)

- **Objectif 0 coût** : uniquement des offres gratuites, aucun service payant.
- **HTML / CSS / JS vanilla (ES modules)**. Pas de framework UI. Bundler : **Vite** (vanilla) + **vite-plugin-pwa** (Workbox, `generateSW`).
- **Hébergement** : front sur **Vercel** (déployé depuis GitHub), API sur **Render** (offre gratuite, s'endort après 15 min : prévoir ~1 min de réveil), base **Neon** (Postgres, offre gratuite).
- **Firebase = Auth uniquement** (Google). Paquets `@firebase/app` + `@firebase/auth` via npm (pas le méta-paquet `firebase`, qui embarque Firestore). Pas de Firestore, pas de Firebase Hosting.
- **API** (`api/`) : Node + **Fastify**, `pg` vers Neon, vérification des ID tokens Firebase avec `jose` (JWKS Google). Migrations SQL versionnées (`api/migrations/NNN_nom.sql`), appliquées au démarrage. En local sans `DATABASE_URL` : **PGlite** (Postgres WASM) dans `api/.data/`.
- **Offline** (fait maison) : base locale IndexedDB par utilisateur + file d'écritures (`outbox`) synchronisée par `POST /api/sync` (patchs par champ, mutations idempotentes à UUID client, curseur de version global, suppression logique). Les vues lisent/écrivent toujours en local. Sync au démarrage, au retour du réseau, au retour au premier plan et toutes les 60 s ; pas de sync en arrière-plan (surtout iOS).
- **Graphiques** : SVG maison (barres, anneau, ligne). Aucune lib de charts.
- **Mobile-first**, responsive : barre de navigation en bas sur mobile, sidebar sur desktop. Thème sombre par défaut + clair. Esthétique sobre noir/blanc, un seul accent de couleur, typographie propre.
- **Dates** : jour = chaîne locale `YYYY-MM-DD` calculée sur l'appareil. Mois = `YYYY-MM`. Semaine ISO = `YYYY-Www`. Timestamps techniques posés par Postgres (`now()`).
- **Argent** : entiers en FCFA, formatage `Intl.NumberFormat('fr-FR')`. Jamais de flottants (`integer`/`bigint` en base).
- Qualité : ESLint + Prettier, Vitest pour la logique pure (front) et pour l'API (`app.inject` + PGlite en mémoire : auth, droits, validation, sync).

## 3. Arborescence cible

```
/
├─ CLAUDE.md  BRIEF.md
├─ vercel.json (CSP + headers)  render.yaml (blueprint API)  firebase.json (émulateur Auth local)
├─ vite.config.js  package.json  .env.example  .gitignore  .vercelignore
├─ public/ (icons 192/512 + maskable, favicon)
├─ src/                  # front (Vercel)
│  ├─ main.js            # bootstrap, SW, routeur
│  ├─ firebase.js        # init app + auth (config via import.meta.env)
│  ├─ api.js             # fetch authentifié vers l'API (jeton Firebase, délai de réveil Render)
│  ├─ session.js         # session de données : moteur de sync + déclencheurs
│  ├─ sync/ (engine.js, merge.js)   # IndexedDB + outbox ; merge.js = logique pure testée
│  ├─ router.js  routes.js  store.js  auth.js
│  ├─ lib/ (dates.js, money.js, dom.js, idb.js, charts.js…)
│  ├─ repos/ (profile.js, habits.js, expenses.js, tasks.js, house.js)   # TOUT accès données ici
│  ├─ views/ (today.js, habits.js, expenses.js, tasks.js, house/*.js, settings.js)
│  ├─ components/ (nav.js, modal.js, toast.js, offlineBadge.js)
│  └─ styles/ (tokens.css, base.css, components.css)
├─ api/                  # backend (Render)
│  ├─ src/ (server.js, app.js, config.js, db.js, migrate.js, auth.js, routes.js, sync.js, collections.js, validate.js)
│  ├─ migrations/ (001_init.sql…)
│  └─ tests/
└─ tests/unit/
```

Règles : les vues n'appellent jamais l'API ni IndexedDB directement, uniquement les `repos/`. Chaque nouvelle collection = une migration SQL + une entrée dans `api/src/collections.js` (champs, schéma, rôles) + un repo.

## 4. Modèle de données (tables Postgres)

Modèle logique ci-dessous ; chaque collection devient une table avec `user_id` (ou `house_id`), `version bigint DEFAULT nextval('change_seq')`, `updated_at`, `deleted_at` (suppression logique), des contraintes `CHECK` reprenant la validation, et un index `(user_id, version)`. Les identifiants de documents sont des UUID générés par le client (sauf singletons comme le profil). Les cases d'habitudes seront des lignes `(habit_id, day)` plutôt qu'une map, pour éviter les conflits entre appareils.

**Espace perso (admin uniquement)** — `users/{uid}/…`

- `habits/{habitId}` : `{ name, emoji, order, active, createdAt }`
- `habitLogs` : une ligne par case cochée `(habitId, day:'YYYY-MM-DD', done)` + une ligne par jour pour `mood` (1..5) et `sleep` (heures).
- `expenses/{id}` : `{ amount:int>0, categoryId, note, date:'YYYY-MM-DD', createdAt, updatedAt }`
- `categories/{id}` : `{ name, emoji, color, monthlyBudget:int }`
- `tasks/{id}` : `{ title, done, priority:1..3, dueDate|null, recurrence:null|'daily'|'weekly'|'monthly', createdAt, doneAt }`
- `dailyGoals/{YYYY-MM-DD}` : `{ items: [{ text, done }] }` (max 5)
- `profile` (table `profiles`, singleton `docId:'me'`) : `{ displayName, currency:'XOF', theme }` — créé côté serveur au premier `GET /api/me`.

**Maison (partagée)** — `houses/{houseId}`

- `houses/{houseId}` : `{ name, adminUid, createdAt }`
- `members/{uid}` : `{ role:'admin'|'member', email, displayName, joinedAt }`
- `menu/{YYYY-Www}` : `{ days: { mon:{lunch,dinner}, tue:{…}, … } }`
- `stock/{id}` : `{ name, qty, unit, minQty, location, updatedAt }` → sous `minQty` = apparaît dans la liste de courses.
- `bills/{id}` : `{ label, amount:int, dueDate, recurrence:null|'monthly'|'yearly', paid, paidAt, paidBy }`
- `shopping/{id}` : `{ name, qty, checked, source:'manual'|'stock'|'menu' }`

**Invitations** — table `invites (email minuscule PK, house_id, created_at)` (écrite par l'admin uniquement ; l'adhésion se fait côté API dans une transaction : création du membre + suppression de l'invitation).

## 5. Rôles et accès (important)

- **Admin** = un seul compte Google, identifié par son e-mail vérifié (`ADMIN_EMAIL`, à me demander, jamais deviné). Seul à avoir accès à tous les modules perso et à **créer la maison, inviter, retirer des membres**.
- **Coloc (member)** : accès **uniquement** au module Maison. Aucun accès aux habitudes, dépenses, tâches. L'UI affiche un shell réduit (pas d'onglets perso).
- **Flux d'invitation** : l'admin saisit l'e-mail du coloc → crée `invites/{email}`. Le coloc se connecte avec Google (e-mail vérifié) → l'app lit son invite → crée `houses/{houseId}/members/{uid}` avec `role:'member'` → supprime l'invite. L'admin peut révoquer à tout moment (suppression du doc `members/{uid}`).
- Droits des colocs : lire tout ; écrire `stock`, `menu`, `shopping` ; marquer une facture `paid` (champs `paid/paidAt/paidBy` uniquement). L'admin seul crée/modifie/supprime les factures et gère les membres.
- Un compte Google inconnu qui se connecte voit un écran « Accès non autorisé » et n'obtient aucune donnée.

## 6. Sécurité by design (OWASP) — à respecter dès la phase 0

**Autorisation côté API** (remplace les règles Firestore) : chaque route vérifie le jeton Firebase (signature RS256 via JWKS Google, `iss`/`aud` = projet, `email_verified`), puis le rôle **calculé côté serveur** (`ADMIN_EMAIL` en variable d'env Render ; membership en base pour les colocs). L'`uid` vient toujours du jeton, jamais du corps. Chaque requête SQL filtre par `user_id`/`house_id`. Validation à deux niveaux : schéma JSON (Fastify, `additionalProperties:false`, pas de coercition) + validateur de champs du registre, puis contraintes `CHECK` Postgres. Requêtes 100 % paramétrées. Les règles ci-dessous restent la **spécification des droits** à reproduire dans l'API et à couvrir par des tests :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null && request.auth.token.email_verified == true; }
    function isAdmin()  { return signedIn() && request.auth.token.email == 'ADMIN_EMAIL'; }
    function isMember(h) { return signedIn() && exists(/databases/$(db)/documents/houses/$(h)/members/$(request.auth.uid)); }
    function isHouseAdmin(h) { return isAdmin() && get(/databases/$(db)/documents/houses/$(h)).data.adminUid == request.auth.uid; }

    match /users/{uid}/{document=**} { allow read, write: if isAdmin() && request.auth.uid == uid; }

    match /houses/{h} {
      allow create: if isAdmin() && request.resource.data.adminUid == request.auth.uid;
      allow read: if isMember(h);
      allow update, delete: if isHouseAdmin(h);

      match /members/{uid} {
        allow read: if isMember(h);
        allow create: if isHouseAdmin(h)
          || (signedIn() && request.auth.uid == uid && request.resource.data.role == 'member'
              && exists(/databases/$(db)/documents/invites/$(request.auth.token.email))
              && get(/databases/$(db)/documents/invites/$(request.auth.token.email)).data.houseId == h);
        allow delete: if isHouseAdmin(h) || (request.auth.uid == uid && resource.data.role == 'member');
        allow update: if isHouseAdmin(h);
      }
      match /stock/{id}    { allow read, write: if isMember(h); }
      match /menu/{id}     { allow read, write: if isMember(h); }
      match /shopping/{id} { allow read, write: if isMember(h); }
      match /bills/{id} {
        allow read: if isMember(h);
        allow create, delete: if isHouseAdmin(h);
        allow update: if isHouseAdmin(h)
          || (isMember(h) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['paid','paidAt','paidBy']));
      }
    }

    match /invites/{email} {
      allow read: if isAdmin() || (signedIn() && request.auth.token.email == email);
      allow create, update, delete: if isAdmin();
    }
    match /{other=**} { allow read, write: if false; }
  }
}
```

Validation attendue sur chaque collection : champs autorisés uniquement, types, `amount` entier dans ]0, 1 000 000 000[, longueurs de chaînes bornées, 5 objectifs du jour max. Création de la maison + du premier membre admin dans une même transaction SQL.

**Autres exigences :**

- **Injection/XSS** : jamais `innerHTML` avec des données utilisateur ; utiliser `textContent` / création de nœuds DOM. Un helper `dom.js` centralise ça.
- **CSP stricte** via `vercel.json` (headers) : `default-src 'self'`, **pas de `'unsafe-inline'` ni `'unsafe-eval'` sur `script-src`**, `connect-src` limité à l'API Render et aux domaines Firebase Auth/Google, `frame-src` pour Google Sign-In, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimale. Cache : `sw.js`/`index.html` en `no-cache`, assets hashés en `immutable`.
- **API** : CORS limité à `ALLOWED_ORIGINS`, `helmet`, rate limit (120 req/min/IP) + 60 sync/min/compte, corps ≤ 256 Ko, erreurs génériques (pas de stack exposée), logs sans en-tête `Authorization`. Après le premier déploiement, remplacer `https://*.onrender.com` par l'URL exacte de l'API dans la CSP de `vercel.json`.
- **Secrets** : la config Firebase web n'est pas secrète mais vit dans `.env` (non commité, `.env.example` fourni). Restreindre la clé API par référents HTTP côté Google Cloud. `DATABASE_URL` et `ADMIN_EMAIL` uniquement dans les variables d'env Render (`api/.env` en local, non commité). `.gitignore` complet.
- **Auth** : Google uniquement, e-mail vérifié obligatoire ; déconnexion qui peut effacer la base locale (IndexedDB) ; le rôle vient de `GET /api/me` (le cache local du rôle sert seulement à ouvrir l'app hors ligne et ne donne accès à aucune donnée serveur).
- **App Check** : non applicable à une API maison sans coût ; en phase 6, durcir plutôt l'API (rate limit par uid, journalisation des refus).
- **Dépendances** : minimum ; `npm audit` à chaque phase (front et `api/`) ; versions verrouillées.
- **Environnements** : en local, API et émulateur Auth liés à `127.0.0.1` uniquement. L'API n'écoute sur `0.0.0.0` que sur Render (variable `RENDER`), et refuse de démarrer en prod avec `FIREBASE_AUTH_EMULATOR_HOST`.
- **Vie privée** : l'export de données (JSON) est local à l'utilisateur ; rien n'est envoyé à un tiers, aucun tracker.

## 7. PWA et offline

- `manifest` : `display: standalone`, `lang: fr`, icônes 192/512 + maskable, `theme_color`, `shortcuts` (« Dépense rapide » → `#/expenses/new`, « Aujourd'hui » → `#/today`).
- Service worker (Workbox) : précache du shell + assets ; stratégie réseau-d'abord/cache-fallback pour la navigation ; mise à jour avec bandeau « Nouvelle version disponible — recharger ».
- Indicateur **Hors ligne / En attente de sync (n)** basé sur `navigator.onLine` + taille de l'`outbox`.
- Tout écran doit rendre correctement **sans réseau** à partir de la base locale IndexedDB. Les appels API ne sont jamais mis en cache par le service worker.

## 8. Phases de livraison

Chaque phase : code, tests, `npm run lint && npm test`, commit clair (`feat(habits): …`), puis court récap de ce qui marche.

- **Phase 0 — Socle** : Vite + PWA + Firebase Auth, routeur, shell responsive (nav bas/sidebar), thème, badge offline, API Fastify (auth, `/api/me`, `/api/sync`, migrations) + tests, moteur de sync IndexedDB, `vercel.json` avec headers de sécurité, `render.yaml`. Écran « Aujourd'hui » vide mais branché (profil synchronisé).
- **Phase 1 — Habit tracker** : CRUD habitudes, grille mensuelle (mobile : vue semaine défilante, colonne des noms sticky ; desktop : mois complet), % par jour + par semaine (barres SVG), anneau global (objectif = habitudes actives × jours du mois), tableau Analyse (objectif/réalisé/restant/%), top habitudes, humeur 1–5 + sommeil, navigation entre mois. Logique de calcul dans `lib/` avec tests Vitest.
- **Phase 2 — Dépenses** : bouton d'ajout rapide (montant → catégorie → ok), liste par jour, catégories + budgets mensuels avec jauge, graphiques (par catégorie, par jour), total du mois, édition/suppression, dépenses récurrentes.
- **Phase 3 — Objectifs du jour + tâches** : 1–5 objectifs du jour cochables, tâches avec priorité/échéance/récurrence, vues Aujourd'hui / À venir / Terminées, rappels in-app (notifications locales si permission accordée).
- **Phase 4 — Maison** : création de la maison, invitation/révocation de colocs (admin seul), stock avec seuil, menu hebdo, factures + échéances + récurrence, liste de courses auto-générée (stock sous seuil) + manuelle. Shell réduit pour les colocs.
- **Phase 5 — « Aujourd'hui » complet** : agrégation (habitudes du jour, objectifs, tâches dues, factures sous 7 jours, dépense du jour + budget restant), actions rapides, revue hebdomadaire automatique (habitudes, dépenses, tâches faites).
- **Phase 6 — Durcissement et extras** : export/import JSON (local, revalidé par l'API), dettes & prêts (qui doit quoi), notes rapides, onglet « Plus », limite de débit par compte sur la sync (en plus de la limite par IP), purge du journal d'idempotence (> 30 j), vues chargées à la demande, audit sécurité final (droits API, CSP, `npm audit`), Lighthouse (la catégorie PWA n'existe plus depuis Lighthouse 12 : installabilité vérifiée via le manifeste et le service worker).

## 9. Commandes de référence

```bash
npm ci && npm --prefix api ci   # dépendances front + API
cp .env.example .env && cp api/.env.example api/.env   # puis renseigner
npm run emulators               # émulateur Auth (CLI firebase globale : npm i -g firebase-tools)
npm run dev:api                 # API sur http://127.0.0.1:8787 (PGlite local si DATABASE_URL vide)
npm run dev                     # front sur http://127.0.0.1:7070
npm run check                   # lint + tests front + tests API
# Déploiement : push sur GitHub → Vercel (front) et Render (api/, render.yaml) redéploient seuls.
```

## 10. Façon de travailler

- Avant de coder une phase : annonce en 5 lignes max ce que tu vas faire.
- Pose-moi une question seulement si c'est bloquant (ex. `ADMIN_EMAIL`, identifiants du projet Firebase, URL Render). Sinon, choisis un défaut raisonnable et note-le.
- Je fais moi-même les étapes console (Firebase Auth, Neon, Render, Vercel, GitHub) : donne-moi les commandes/étapes exactes plutôt que de les inventer.
- Ne jamais supprimer de données, committer de secrets, ni désactiver un contrôle de sécurité de l'API « pour tester ».
- Code propre et modulaire, fonctions courtes, noms explicites, commentaires uniquement quand le « pourquoi » n'est pas évident.
- Termine chaque phase par : ce qui marche, comment le tester (commandes), ce qui reste.
