# Déploiement de LifeHub

État au 6 octobre 2026. Tout tourne sur des offres gratuites, avec un seul compte Google (le compte admin, celui de `ADMIN_EMAIL`) pour Firebase, Google Cloud, Neon, Render et Vercel.

## Vue d'ensemble

| Rôle             | Service                                                                    | Adresse / identifiant                 |
| ---------------- | -------------------------------------------------------------------------- | ------------------------------------- |
| Front (PWA)      | Vercel, projet `lifehub` (équipe « Daren's projects »)                     | https://lifehub-jade-ten.vercel.app   |
| API              | Render, service web `lifehub-api` (Blueprint `lifehub`, région Frankfurt)  | https://lifehub-api-pryz.onrender.com |
| Base de données  | Neon, projet `lifehub` (AWS eu-central-1, base `neondb`, connexion poolée) | —                                     |
| Connexion Google | Firebase Auth, projet `lifehub-1d337`                                      | —                                     |
| Code             | GitHub `darenallan/lifehub`, branche `main`                                | —                                     |

Un `git push` sur `main` redéploie automatiquement le front (Vercel) et l'API (Render, d'après `render.yaml`).

## Variables d'environnement

Les valeurs secrètes ne sont **jamais** dans le dépôt. Les modèles sont dans `.env.example` et `api/.env.example`.

**Vercel** (Settings → Environment Variables, type **Config**, environnement Production) :

| Variable                    | Valeur                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`     | clé `AIza…` (console Firebase → Paramètres du projet → Vos applications → LifeHub) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `lifehub-1d337.firebaseapp.com`                                                    |
| `VITE_FIREBASE_PROJECT_ID`  | `lifehub-1d337`                                                                    |
| `VITE_FIREBASE_APP_ID`      | `1:603671447140:web:d5e05fd8fca1380acb0171`                                        |
| `VITE_API_URL`              | `https://lifehub-api-pryz.onrender.com` (sans `/` final)                           |

Ces valeurs sont publiques (elles finissent dans le JavaScript du site). Les déclarer en **Config**, pas en **Secret** : Vercel refuse d'enregistrer un Secret dont le nom commence par `VITE_`, et un Secret ne peut plus être converti (il faut le supprimer puis le recréer). Vite les intègre **au build** : après toute modification, redéployer (Deployments → « … » → Redeploy).

**Render** (service `lifehub-api` → Environment) :

| Variable              | Valeur                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------- |
| `ADMIN_EMAIL`         | e-mail du compte Google admin                                                          |
| `DATABASE_URL`        | chaîne de connexion Neon (bouton « Connect » → « Copy snippet ») — **secret**          |
| `ALLOWED_ORIGINS`     | `https://lifehub-jade-ten.vercel.app` (plusieurs origines : séparées par des virgules) |
| `FIREBASE_PROJECT_ID` | `lifehub-1d337` (fixé dans `render.yaml`)                                              |
| `NODE_VERSION`        | `24` (fixé dans `render.yaml`)                                                         |
| `VAPID_PUBLIC_KEY`    | clé publique Web Push (voir « Rappels app fermée ») — facultatif                       |
| `VAPID_PRIVATE_KEY`   | clé privée Web Push — **secret**                                                       |
| `PUSH_CRON_SECRET`    | secret partagé avec cron-job.org (64 caractères hexadécimaux) — **secret**             |

## Rappels app fermée (Web Push)

Sans les trois variables ci-dessous, l'app marche normalement mais la carte « Rappels app fermée » affiche « Pas encore configuré sur le serveur ».

1. **Générer les clés** (une seule fois, sur ton PC) :
   ```bash
   npx --prefix api web-push generate-vapid-keys
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   La première commande donne `Public Key` et `Private Key`, la seconde le secret du cron.
2. **Render** → `lifehub-api` → Environment : ajouter `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_CRON_SECRET`, puis « Save, rebuild, and deploy ». Ne jamais changer les clés VAPID ensuite : tous les appareils abonnés devraient se réabonner.
3. **cron-job.org** (gratuit) → créer un compte → « Create cronjob » :
   - URL : `https://lifehub-api-pryz.onrender.com/api/push/tick`
   - Planning : toutes les minutes
   - Avancé → Méthode **POST**, en-tête `x-cron-secret` = la valeur de `PUSH_CRON_SECRET`
   - Activer « Notify on failure » (prévenu si l'API ne répond plus).
4. **Sur chaque appareil** : Plus → Réglages → « Rappels app fermée » → « Activer sur cet appareil ». Sur iPhone, l'app doit d'abord être installée sur l'écran d'accueil (iOS 16.4+).

À savoir :

- Le cron réveille l'API toutes les minutes : elle reste allumée (~744 h/mois sur les 750 h gratuites de Render, donc **un seul service** gratuit possible). Neon n'est pas réveillé à chaque minute : l'API garde le planning en mémoire et n'écrit en base que quand un rappel part.
- Le contenu des notifications est toujours générique (« C'est l'heure d'une prise », « Rappel de rendez-vous ») : aucun nom de médicament ne passe par les serveurs de Google, Apple ou Mozilla.
- Chaque appareil envoie le planning des 7 prochains jours quand il change : un appareil qui n'ouvre pas l'app pendant plus de 7 jours ne recevra plus de rappels au-delà.
- Tester : `curl -X POST -H "x-cron-secret: <secret>" https://lifehub-api-pryz.onrender.com/api/push/tick` doit répondre `{"sent":0}` (ou plus).

## Appli Android (Capacitor)

Le même code web, empaqueté dans une appli Android (`android/`, identifiant `app.lifehub.mobile`) : alarmes locales exactes (prises, rendez-vous) qui sonnent **même sans réseau**, et connexion Google native (Google interdit la connexion dans une WebView). Les données passent par la même API.

**Une seule fois :**

1. **Empreinte SHA-1** de la clé de debug (celle d'Android Studio) :
   ```powershell
   & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
   ```
   Copier la ligne `SHA1:`. (Pour une version signée « release », faire de même avec ta propre clé ; ne jamais la committer.)
2. **Firebase** → Paramètres du projet → Vos applications → Ajouter une application → **Android** : nom du paquet `app.lifehub.mobile`, empreinte SHA-1. Le fichier `google-services.json` proposé n'est **pas** nécessaire (on n'utilise pas le SDK Firebase Android).
3. **ID client Web** : Firebase → Authentication → Sign-in method → Google → « Configuration du SDK Web » → **ID client Web** (finit par `.apps.googleusercontent.com`).
4. **Render** → `ALLOWED_ORIGINS` : ajouter `,https://localhost` (origine de l'appli), puis redéployer.
5. **Google Cloud** → clé API « Browser key » → restrictions : ajouter le site `https://localhost/*` (la WebView de l'appli l'envoie comme référent).

**Java 21 obligatoire** (les plugins Capacitor 8 l'exigent ; Java 25 fait planter Gradle 8.14). Temurin 21 est installé (`C:\Program Files\Eclipse Adoptium\jdk-21…`) : dans Android Studio, Settings → Build, Execution, Deployment → Build Tools → Gradle → **Gradle JDK** = Temurin 21.

**Construire et installer :**

```bash
cp .env.android.example .env.android   # puis renseigner (mêmes valeurs que Vercel + VITE_GOOGLE_WEB_CLIENT_ID)
npm run build:android                  # build web (mode android) + copie dans android/
npm run android                        # ouvre Android Studio
```

Dans Android Studio : brancher le téléphone (options développeur → débogage USB) et ▶ Run, ou Build → Build App Bundle(s) / APK(s) → Build APK(s) pour un fichier à installer.

**Dans l'appli :** Plus → Réglages → « Alarmes de l'appli » → Activer, puis autoriser « Alarmes et rappels » si Android le demande. Si le téléphone économise la batterie de façon agressive, exclure LifeHub de l'optimisation. Les alarmes couvrent 7 jours et sont reprogrammées à chaque ouverture : ouvrir l'appli au moins une fois par semaine.

À savoir : `npm audit` signale une faille « modérée » dans `uuid`, via `@capacitor/cli` → `xcode` (outillage iOS en ligne de commande, jamais embarqué dans l'appli). Le correctif proposé rétrograde la CLI : ignoré volontairement.

## Réglages de sécurité en place

- **Clé API Firebase** (Google Cloud → API et services → Identifiants → « Browser key (auto created by Firebase) ») : restreinte aux sites `https://lifehub-jade-ten.vercel.app/*` et `https://lifehub-1d337.firebaseapp.com/*` (le second sert à la fenêtre de connexion Google), et aux 25 API par défaut de Firebase.
- **Firebase Auth** → Paramètres → Domaines autorisés : `lifehub-jade-ten.vercel.app` ajouté (plus les domaines par défaut).
- **API** : CORS limité à `ALLOWED_ORIGINS`, jetons Firebase vérifiés, rôle calculé côté serveur, limites de débit.
- **Front** : CSP stricte dans `vercel.json`, qui vise l'URL exacte de l'API et le domaine Firebase du projet.

## Changer de domaine (nom de domaine perso, autre URL Vercel…)

Le domaine du front est déclaré à **trois** endroits, à mettre à jour ensemble, sinon la connexion casse :

1. Restrictions de la clé API (Google Cloud), ajouter `https://nouveau-domaine/*`.
2. Domaines autorisés de Firebase Auth.
3. `ALLOWED_ORIGINS` sur Render (puis « Save, rebuild, and deploy »).

Si c'est l'**API** qui change d'URL : mettre à jour `VITE_API_URL` sur Vercel (puis redéployer) et `connect-src` dans `vercel.json` (puis pousser).

## Changer le mot de passe Neon

Neon → projet `lifehub` → Roles → réinitialiser le mot de passe de `neondb_owner`, puis remplacer `DATABASE_URL` sur Render. Garder `sslmode=require` et `channel_binding=require` : l'API convertit `channel_binding` pour le pilote `pg` (`api/src/db.js`).

## Comportement à connaître

- **Réveil de l'API** : l'offre gratuite de Render s'endort après 15 min sans requête. Le premier appel suivant prend jusqu'à environ une minute ; l'app affiche « Connexion au serveur… » pendant ce temps. Hors ligne, l'app fonctionne avec ses données locales et synchronise au retour.
- **Mises à jour de l'app** : après un déploiement, l'app ouverte affiche « Nouvelle version disponible » ; cliquer « Recharger ». Pour changer l'icône sur un téléphone, réinstaller la PWA.

## Vérifier que tout va bien

```bash
curl https://lifehub-api-pryz.onrender.com/healthz   # {"ok":true}
curl https://lifehub-api-pryz.onrender.com/api/me    # 401 {"error":"missing_token"} : normal sans connexion
```

Côté navigateur : ouvrir le site, se connecter avec Google, l'écran « Aujourd'hui » doit s'afficher avec tous les onglets.

## Développement local

```bash
npm ci && npm --prefix api ci
cp .env.example .env && cp api/.env.example api/.env   # puis renseigner (émulateur Auth en local)
npm run emulators    # émulateur Firebase Auth (CLI firebase globale)
npm run dev:api      # API sur http://127.0.0.1:8787, base PGlite locale dans api/.data/
npm run dev          # front sur http://127.0.0.1:7070
npm run check        # lint + tests front + tests API
```

## Pièges rencontrés pendant la mise en ligne

- Sur l'écran d'import Vercel, le bouton « Add More » des variables **lance le déploiement**. Créer le projet, puis ajouter les variables dans Settings.
- Une variable `VITE_` vide ou absente au build donne un **écran noir** (« Config Firebase manquante » dans la console) : vérifier les variables puis redéployer.
- La clé `BAGS…` de la console Firebase est une clé VAPID (notifications push), **pas** la clé API. La clé API commence par `AIza`.
- Lire les variables une par une (`import.meta.env.VITE_X`), jamais `import.meta.env` en entier : sinon Vite embarque toutes les variables `VITE_*`, y compris celles que Vercel ajoute (`VITE_VERCEL_*` : message de commit, auteur…).
