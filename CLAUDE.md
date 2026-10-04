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

- **HTML / CSS / JS vanilla (ES modules)**. Pas de framework UI. Bundler : **Vite** (vanilla) + **vite-plugin-pwa** (Workbox, `generateSW`).
- **Firebase** : Auth (Google uniquement), Firestore, Hosting. SDK modulaire v10+ installé via npm (pas de CDN, pour que tout soit mis en cache hors ligne).
- **Offline** : `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`. Les écritures hors ligne sont mises en file et envoyées au retour du réseau (à la prochaine ouverture de l'app si elle a été fermée : pas de promesse de sync en arrière-plan, surtout sur iOS).
- **Graphiques** : SVG maison (barres, anneau, ligne). Aucune lib de charts.
- **Mobile-first**, responsive : barre de navigation en bas sur mobile, sidebar sur desktop. Thème sombre par défaut + clair. Esthétique sobre noir/blanc, un seul accent de couleur, typographie propre.
- **Dates** : jour = chaîne locale `YYYY-MM-DD` calculée sur l'appareil. Mois = `YYYY-MM`. Semaine ISO = `YYYY-Www`. Timestamps techniques via `serverTimestamp()`.
- **Argent** : entiers en FCFA, formatage `Intl.NumberFormat('fr-FR')`. Jamais de flottants.
- Qualité : ESLint + Prettier, Vitest pour la logique pure, tests des règles Firestore sur l'émulateur.

## 3. Arborescence cible

```
/
├─ CLAUDE.md  BRIEF.md
├─ firebase.json  firestore.rules  firestore.indexes.json  .firebaserc
├─ vite.config.js  package.json  .env.example  .gitignore
├─ public/ (icons 192/512 + maskable, favicon)
├─ src/
│  ├─ main.js            # bootstrap, SW, routeur
│  ├─ firebase.js        # init app/auth/firestore (config via import.meta.env)
│  ├─ router.js          # routeur hash (#/today, #/habits…)
│  ├─ store.js           # état global minimal (user, role, online, pendingWrites)
│  ├─ auth.js            # login Google, logout, garde de routes
│  ├─ lib/ (dates.js, money.js, dom.js, charts.js)
│  ├─ repos/ (habits.js, expenses.js, tasks.js, house.js)   # TOUT accès Firestore ici
│  ├─ views/ (today.js, habits.js, expenses.js, tasks.js, house/*.js, settings.js)
│  ├─ components/ (nav.js, modal.js, toast.js, offlineBadge.js)
│  └─ styles/ (tokens.css, base.css, components.css)
└─ tests/ (unit/, rules/)
```

Règle : les vues n'appellent jamais Firestore directement, uniquement les `repos/`.

## 4. Modèle de données Firestore

**Espace perso (admin uniquement)** — `users/{uid}/…`

- `habits/{habitId}` : `{ name, emoji, order, active, createdAt }`
- `habitLogs/{YYYY-MM}` : `{ checks: { [habitId]: { "01": true, "02": true } }, mood: { "01": 1..5 }, sleep: { "01": heures } }`
  Mise à jour avec des **chemins pointés** (`updateDoc(ref, { ["checks."+id+"."+dd]: true })`) pour éviter les conflits entre appareils.
- `expenses/{id}` : `{ amount:int>0, categoryId, note, date:'YYYY-MM-DD', createdAt, updatedAt }`
- `categories/{id}` : `{ name, emoji, color, monthlyBudget:int }`
- `tasks/{id}` : `{ title, done, priority:1..3, dueDate|null, recurrence:null|'daily'|'weekly'|'monthly', createdAt, doneAt }`
- `dailyGoals/{YYYY-MM-DD}` : `{ items: [{ text, done }] }` (max 5)
- `settings/profile` : `{ displayName, currency:'XOF', theme }`

**Maison (partagée)** — `houses/{houseId}`

- `houses/{houseId}` : `{ name, adminUid, createdAt }`
- `members/{uid}` : `{ role:'admin'|'member', email, displayName, joinedAt }`
- `menu/{YYYY-Www}` : `{ days: { mon:{lunch,dinner}, tue:{…}, … } }`
- `stock/{id}` : `{ name, qty, unit, minQty, location, updatedAt }` → sous `minQty` = apparaît dans la liste de courses.
- `bills/{id}` : `{ label, amount:int, dueDate, recurrence:null|'monthly'|'yearly', paid, paidAt, paidBy }`
- `shopping/{id}` : `{ name, qty, checked, source:'manual'|'stock'|'menu' }`

**Invitations (top-level)** — `invites/{emailMinuscule}` : `{ houseId, createdAt }` (écrit par l'admin uniquement).

## 5. Rôles et accès (important)

- **Admin** = un seul compte Google, identifié par son e-mail vérifié (`ADMIN_EMAIL`, à me demander, jamais deviné). Seul à avoir accès à tous les modules perso et à **créer la maison, inviter, retirer des membres**.
- **Coloc (member)** : accès **uniquement** au module Maison. Aucun accès aux habitudes, dépenses, tâches. L'UI affiche un shell réduit (pas d'onglets perso).
- **Flux d'invitation** : l'admin saisit l'e-mail du coloc → crée `invites/{email}`. Le coloc se connecte avec Google (e-mail vérifié) → l'app lit son invite → crée `houses/{houseId}/members/{uid}` avec `role:'member'` → supprime l'invite. L'admin peut révoquer à tout moment (suppression du doc `members/{uid}`).
- Droits des colocs : lire tout ; écrire `stock`, `menu`, `shopping` ; marquer une facture `paid` (champs `paid/paidAt/paidBy` uniquement). L'admin seul crée/modifie/supprime les factures et gère les membres.
- Un compte Google inconnu qui se connecte voit un écran « Accès non autorisé » et n'obtient aucune donnée.

## 6. Sécurité by design (OWASP) — à respecter dès la phase 0

**Firestore rules** (fichier `firestore.rules`, squelette à affiner + tester) :

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

À compléter : validation de schéma sur chaque collection (`keys().hasOnly`, types, `amount is int && amount > 0 && amount < 1000000000`, longueurs de chaînes bornées, `items.size() <= 5`). Création de la maison + du premier `members/{adminUid}` en deux écritures successives (ou `getAfter()`).

**Autres exigences :**

- **Injection/XSS** : jamais `innerHTML` avec des données utilisateur ; utiliser `textContent` / création de nœuds DOM. Un helper `dom.js` centralise ça.
- **CSP stricte** via `firebase.json` (headers) : `default-src 'self'`, **pas de `'unsafe-inline'` ni `'unsafe-eval'` sur `script-src`**, `connect-src` limité aux domaines Firebase/Google, `frame-src` pour Google Sign-In (ajuster en testant), `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Ajouter `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimale. Cache : `sw.js` en `no-cache`, assets hashés en `immutable`.
- **Secrets** : la config Firebase web n'est pas secrète mais vit dans `.env` (non commité, `.env.example` fourni). Restreindre la clé API par référents HTTP côté Google Cloud. Aucun secret serveur dans le repo. `.gitignore` complet.
- **Auth** : Google uniquement, e-mail vérifié obligatoire ; déconnexion qui vide le cache local sensible (option) ; pas de rôle stocké côté client comme source de vérité (le rôle vient des règles/membership).
- **App Check** (reCAPTCHA v3) : à activer en phase 6.
- **Dépendances** : minimum ; `npm audit` à chaque phase ; versions verrouillées.
- **Environnements** : émulateurs Firebase en local, liés à `127.0.0.1` uniquement (jamais `0.0.0.0`). Aucun port exposé inutilement.
- **Vie privée** : l'export de données (JSON) est local à l'utilisateur ; rien n'est envoyé à un tiers, aucun tracker.

## 7. PWA et offline

- `manifest` : `display: standalone`, `lang: fr`, icônes 192/512 + maskable, `theme_color`, `shortcuts` (« Dépense rapide » → `#/expenses/new`, « Aujourd'hui » → `#/today`).
- Service worker (Workbox) : précache du shell + assets ; stratégie réseau-d'abord/cache-fallback pour la navigation ; mise à jour avec bandeau « Nouvelle version disponible — recharger ».
- Indicateur **Hors ligne / En attente de sync (n)** basé sur `navigator.onLine` + `snapshot.metadata.hasPendingWrites`.
- Tout écran doit rendre correctement **sans réseau** à partir du cache Firestore.

## 8. Phases de livraison

Chaque phase : code, tests, `npm run lint && npm test`, commit clair (`feat(habits): …`), puis court récap de ce qui marche.

- **Phase 0 — Socle** : Vite + PWA + Firebase init, auth Google, routeur, shell responsive (nav bas/sidebar), thème, badge offline, règles Firestore de base + tests, `firebase.json` avec headers de sécurité, déploiement Hosting. Écran « Aujourd'hui » vide mais branché.
- **Phase 1 — Habit tracker** : CRUD habitudes, grille mensuelle (mobile : vue semaine défilante, colonne des noms sticky ; desktop : mois complet), % par jour + par semaine (barres SVG), anneau global (objectif = habitudes actives × jours du mois), tableau Analyse (objectif/réalisé/restant/%), top habitudes, humeur 1–5 + sommeil, navigation entre mois. Logique de calcul dans `lib/` avec tests Vitest.
- **Phase 2 — Dépenses** : bouton d'ajout rapide (montant → catégorie → ok), liste par jour, catégories + budgets mensuels avec jauge, graphiques (par catégorie, par jour), total du mois, édition/suppression, dépenses récurrentes.
- **Phase 3 — Objectifs du jour + tâches** : 1–5 objectifs du jour cochables, tâches avec priorité/échéance/récurrence, vues Aujourd'hui / À venir / Terminées, rappels in-app (notifications locales si permission accordée).
- **Phase 4 — Maison** : création de la maison, invitation/révocation de colocs (admin seul), stock avec seuil, menu hebdo, factures + échéances + récurrence, liste de courses auto-générée (stock sous seuil) + manuelle. Shell réduit pour les colocs.
- **Phase 5 — « Aujourd'hui » complet** : agrégation (habitudes du jour, objectifs, tâches dues, factures sous 7 jours, dépense du jour + budget restant), actions rapides, revue hebdomadaire automatique (habitudes, dépenses, tâches faites).
- **Phase 6 — Durcissement et extras** : App Check, export/import JSON, dettes & prêts (qui doit quoi), notes rapides, audit sécurité final (rules, CSP, `npm audit`), Lighthouse PWA ≥ 90.

## 9. Commandes de référence

```bash
npm create vite@latest lifehub -- --template vanilla && cd lifehub
npm i firebase && npm i -D vite-plugin-pwa vitest eslint prettier @firebase/rules-unit-testing firebase-tools
cp .env.example .env            # puis renseigner la config Firebase
npm run dev                     # dev local
npm run lint && npm test        # qualité
npx firebase emulators:start --only auth,firestore,hosting   # émulateurs (127.0.0.1)
npm run build && npx firebase deploy --only hosting,firestore:rules,firestore:indexes
```

## 10. Façon de travailler

- Avant de coder une phase : annonce en 5 lignes max ce que tu vas faire.
- Pose-moi une question seulement si c'est bloquant (ex. `ADMIN_EMAIL`, identifiants du projet Firebase). Sinon, choisis un défaut raisonnable et note-le.
- Je fais moi-même les étapes console (création du projet Firebase, activation Auth Google, déploiement) : donne-moi les commandes/étapes exactes plutôt que de les inventer.
- Ne jamais supprimer de données, committer de secrets, ni désactiver une règle de sécurité « pour tester ».
- Code propre et modulaire, fonctions courtes, noms explicites, commentaires uniquement quand le « pourquoi » n'est pas évident.
- Termine chaque phase par : ce qui marche, comment le tester (commandes), ce qui reste.
