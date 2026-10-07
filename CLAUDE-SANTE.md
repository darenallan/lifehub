# CLAUDE-SANTE.md — Module « Santé » (addendum à CLAUDE.md, Phase 7)

> Lis d'abord `CLAUDE.md` : la stack, les conventions, les règles de sécurité et la structure `repos/ views/ lib/` s'appliquent telles quelles. Ce fichier ajoute un module **Santé** inspiré de MyTherapy, mais intégré à l'app (habitudes, dépenses, « Aujourd'hui »). Accès : **admin uniquement** (les règles `users/{uid}/**` existantes couvrent déjà ça).

## 1. Objectif

Suivre son traitement et sa santé au même endroit, **offline-first** : médicaments + rappels, prises confirmées, stock, mesures (tension, glycémie…), journal de symptômes/humeur/douleur, rendez-vous, contacts médicaux, carte d'urgence, rapports PDF pour le médecin.

**Garde-fous produit (obligatoires)**

- Aucun conseil médical, aucune suggestion de dose, **aucun contrôle d'interactions** (pas de base médicamenteuse sous licence). Tout est saisi par l'utilisateur.
- Bandeau/écran d'info au premier lancement du module : « Cet outil t'aide à suivre ton traitement. Il ne remplace pas l'avis d'un médecin ou d'un pharmacien. »
- Les seuils/plages cibles sont **définis par l'utilisateur** (ex. tension cible donnée par son médecin), jamais pré-remplis comme normes médicales.

## 2. Fonctionnalités (périmètre complet)

**A. Médicaments & traitements**

- Fiche : nom, forme (comprimé, gélule, sirop, injection, gouttes, crème, inhalateur, patch, suppositoire, autre), dosage (`500 mg`), quantité par prise + unité, consigne (avant/pendant/après repas, à jeun…), couleur/icône, dates de début/fin (ou en continu), médecin prescripteur, notes, actif/archivé.
- Planification : tous les jours · jours précis de la semaine · tous les N jours · toutes les N heures · cure (X jours on / Y jours off) · mensuel · **à la demande** (avec **dose max/24 h définie par l'utilisateur** et avertissement si dépassée) · plusieurs horaires par jour avec dose différente par horaire.
- Prise : **Pris / Ignoré / Reporté (snooze)**, heure réelle de prise modifiable, note, **annuler** une confirmation. Prise en retard autorisée. « Rattrapage » à l'ouverture de l'app pour les prises manquées.
- Intervalle minimal entre deux prises (défini par l'utilisateur) → avertissement de double prise.
- Traitements temporaires (cure d'antibiotiques) : fin automatique + résumé « cure terminée ».

**B. Rappels** (voir §6 pour l'architecture : ça dépend du canal choisi)

- Rappel à l'heure, répétition (toutes les X min, N fois), snooze, rappel en avance optionnel.
- **Mode discret** : la notification dit « Rappel de prise » sans nom de médicament.
- Rappels de mesures, de rendez-vous (J-1, H-2), de renouvellement de stock.

**C. Stock & renouvellement**

- Quantité restante, décrémentée automatiquement à chaque prise (annulée si la prise est annulée), seuil d'alerte, estimation « il reste X jours », pharmacie habituelle, prix.
- Action « J'ai racheté » : +quantité, **et crée une dépense FCFA** (catégorie « Santé ») dans le module Dépenses.

**D. Mesures**

- Types : tension (systolique/diastolique + pouls), glycémie (mg/dL ou mmol/L au choix), poids (+ taille → IMC calculé), température, pouls, SpO₂, tour de taille, HbA1c, cholestérol, débit expiratoire de pointe, + **types personnalisés** (nom, unité).
- Contexte optionnel (à jeun, après repas, avant/après effort), note, plage cible perso, graphiques ligne (7/30/90 j), moyenne, min/max, tendance.
- Rappels de mesure planifiables.

**E. Journal santé (quotidien)**

- Humeur 1–5, énergie 1–5, douleur 0–10 avec zone, symptômes (liste par défaut + personnalisés, intensité 1–5, notes), tags libres, note du jour.
- Réutilise humeur/sommeil déjà présents dans `habitLogs` (pas de doublon : une seule source de vérité, l'écran Santé lit/écrit au même endroit).
- Corrélations simples affichées (ex. « jours avec prise manquée vs symptôme X ») : descriptif, sans interprétation médicale.

**F. Rendez-vous & contacts**

- Médecins/spécialistes/pharmacies : nom, spécialité, téléphone (`tel:` cliquable), adresse, notes.
- RDV : médecin, date/heure, motif, lieu, rappels, statut, **notes post-consultation** (prescriptions, prochaine étape), lien vers les médicaments prescrits.

**G. Carte d'urgence (accessible hors ligne en 2 taps)**

- Groupe sanguin, allergies, pathologies chroniques, médicaments actuels (auto), contacts d'urgence (tap-to-call), médecin traitant. Écran plein format + raccourci PWA « Urgence ».

**H. Stats & rapports**

- Observance : % de prises à l'heure / en retard / manquées / ignorées, par médicament, par moment de la journée, série (streak), calendrier thermique mensuel.
- **Rapport pour le médecin** (période au choix) : liste des traitements, observance, tableau + courbes des mesures, symptômes/humeur, notes. Export **PDF via feuille de style d'impression** (`window.print()` → « Enregistrer en PDF », zéro dépendance) + **CSV**.

**I. Intégrations avec le reste de l'app**

- Écran « Aujourd'hui » : carte **Prises du jour** (boutons Pris/Ignorer directement), prochaine prise, mesures à faire, RDV du jour.
- Dépenses : achats de médicaments → catégorie Santé. Tâches : « acheter X » → liste de courses santé.
- Habitudes : possibilité de lier une habitude (hydratation, sport) au journal santé.

**J. Plus tard / optionnel (Phase 7.7)**

- **Proche aidant** : partager avec une personne de confiance un **résumé en lecture seule** (observance + alerte de prise manquée), avec consentement par catégorie, révocable. Jamais l'accès complet.
- Verrouillage de l'app par **PIN** (protège l'écran, pas le stockage), chiffrement optionnel des champs texte sensibles côté client (AES-GCM, clé dérivée d'une phrase secrète : si elle est perdue, ces champs sont perdus).

## 3. Modèle de données (sous `users/{uid}/`)

- `meds/{medId}` :
  ```
  { name, form, strength, unit, instructions, color, icon,
    startDate:'YYYY-MM-DD', endDate:null|'YYYY-MM-DD', active, doctorId|null, notes,
    schedule: { type:'daily'|'weekdays'|'everyNDays'|'everyNHours'|'cycle'|'monthly'|'asNeeded',
                times:[{ time:'HH:mm', amount:number }], weekdays:[1..7], interval:int,
                cycle:{ on:int, off:int }, maxPer24h:int|null, minGapMin:int|null },
    reminder: { enabled, advanceMin, repeatEveryMin, repeatCount, snoozeMin, discreet },
    stock: { qty:number, refillAt:number, pharmacy, price:int|null },
    createdAt, updatedAt }
  ```
- `doseLogs/{medId_YYYYMMDD_HHmm}` — **ID déterministe** (pas de doublons, offline-safe) : `{ medId, date, time, amount, status:'taken'|'skipped'|'snoozed', at (heure réelle), note, updatedAt }`. Les prises « à venir/manquées » sont **calculées** à partir du planning ; on n'écrit un log que lorsque l'utilisateur agit. Prise à la demande : ID `medId_YYYYMMDD_HHmmss`.
- `measureTypes/{id}` : `{ key, label, unit, fields:['sys','dia','pulse']|['value'], target:{min,max}|null, custom }`
- `measures/{id}` : `{ typeKey, values:{…}, at:timestamp, date, context, note }`
- `healthJournal/{YYYY-MM-DD}` : `{ mood, energy, pain:{ zone, level }, symptoms:[{ name, severity, note }], tags:[], note }`
- `doctors/{id}` : `{ name, specialty, phone, address, notes, kind:'doctor'|'pharmacy' }`
- `appointments/{id}` : `{ doctorId, at, reason, place, status, afterNotes, reminders:[…] }`
- `healthProfile/main` : `{ bloodGroup, allergies:[], conditions:[], emergencyContacts:[{ name, phone, relation }], height }`
- `devices/{deviceId}` (pour le push, §6) : `{ fcmToken, platform, updatedAt }`

Règles Firestore : le périmètre `users/{uid}/**` (admin) couvre déjà tout ; **ajouter la validation de schéma** pour chaque collection (types, bornes, `keys().hasOnly`, tailles de chaînes et de listes limitées) et des **tests de règles** (un autre utilisateur ne lit rien ; un coloc non plus).

## 4. Logique clé (à isoler dans `src/lib/health/` + tests Vitest)

- `occurrencesBetween(med, fromDate, toDate)` → `[{ id, date, time, amount }]` pour tous les types de planning (cure, N jours, N heures, mensuel, fin de mois, début/fin de traitement).
- `statusFor(occurrence, logs, now, graceMin=120)` → `upcoming | due | taken | skipped | snoozed | missed`.
- `adherence(med, range)` → `{ taken, late, skipped, missed, pct }`.
- `daysOfStock(med)` → estimation selon planning réel.
- **Heures « murales »** : `08:00` reste `08:00` partout où il est (Casablanca ↔ Ouagadougou ; le Maroc change d'heure pendant le Ramadan). Calculer toujours à partir de l'heure locale de l'appareil, tester avec changement de fuseau et de décalage horaire.
- Les opérations de stock utilisent `increment()` Firestore (sûr hors ligne), pas lecture-puis-écriture.

## 5. Sécurité & vie privée (données de santé = sensibles)

- Aucune donnée de santé dans les logs console, les URLs, les query strings ni un service tiers. Aucun analytics.
- Les notifications ne contiennent jamais de valeurs de mesures ; noms de médicaments masqués si « mode discret ».
- Pas de `innerHTML` avec des données saisies (cf. CLAUDE.md). Le rapport PDF est construit avec les mêmes helpers DOM sûrs.
- Bouton « Supprimer toutes mes données de santé » (avec confirmation forte) + export JSON complet.
- Cache local : rappelle à l'utilisateur que les données sont sur l'appareil ; proposer le verrouillage PIN et la déconnexion à distance (révoquer les `devices`).
- CSP : mettre à jour `connect-src` pour FCM si le push est activé ; toujours **sans** `unsafe-inline`.

## 6. Rappels : architecture à 3 niveaux (important, ne pas survendre)

Un rappel de médicament est critique ; une PWA seule ne garantit pas la ponctualité app fermée. Implémenter dans cet ordre :

1. **Niveau 1 — dans l'app (toujours)** : bandeau « prises en retard », badge sur l'icône quand supporté, écran Rattrapage à l'ouverture, notifications via le service worker tant que l'app/SW est vivant.
2. **Niveau 2 — Web Push (FCM)** _(nécessite le plan Firebase Blaze, carte bancaire requise, usage normalement dans le quota gratuit)_ :
   - Le client enregistre son token dans `devices/{deviceId}` et matérialise les rappels des 7 prochains jours dans `reminders/{id}` : `{ fireAt, medId|ref, discreet, sent:false }`.
   - Une **Cloud Function planifiée** (chaque minute) envoie les rappels échus via FCM et marque `sent:true` ; une autre régénère la fenêtre glissante chaque nuit.
   - `notificationclick` ouvre l'app en deep link `#/health/dose/<id>?action=taken|skip|snooze` (pas d'écriture Firestore depuis le SW).
   - Limites à documenter : sur iOS, uniquement PWA installée sur l'écran d'accueil (iOS ≥ 16.4) ; l'économiseur de batterie Android peut retarder.
3. **Niveau 3 — Appli Android via Capacitor** _(recommandé pour la fiabilité)_ : même code web, plugin `@capacitor/local-notifications` avec alarmes exactes, **fonctionne sans réseau**. À planifier après que le module marche en PWA.

Décision à confirmer avec l'utilisateur avant la Phase 7.6 : Niveau 2, Niveau 3, ou les deux.

## 7. Phases de livraison

Même discipline que CLAUDE.md : MVP utilisable à chaque phase, tests, `npm run lint && npm test`, commits clairs.

- **7.0 Fondations** : navigation Santé, écran d'avertissement, règles + validation + tests, `healthProfile` et **carte d'urgence**, raccourci PWA « Urgence ».
- **7.1 Médicaments & prises** : CRUD, tous les types de planning, `occurrencesBetween`/`statusFor` (+tests), écran « Prises du jour », Pris/Ignoré/Reporté/Annuler, Rattrapage, carte dans « Aujourd'hui », rappels niveau 1.
- **7.2 Stock** : décrément auto, seuils, estimation, « J'ai racheté » → dépense FCFA.
- **7.3 Mesures & journal** : types + personnalisés, saisie rapide, plages cibles perso, graphiques SVG, journal quotidien (symptômes/humeur/douleur), réutilisation humeur/sommeil.
- **7.4 RDV & contacts** : médecins/pharmacies, rendez-vous, notes post-consultation, rappels.
- **7.5 Stats & rapports** : observance, calendrier thermique, rapport médecin (print-PDF) + CSV.
- **7.6 Rappels fiables** : niveau 2 et/ou 3 selon la décision (§6). Pour le niveau 2 :
  ```bash
  npx firebase init functions          # JavaScript, Node 20+
  npm --prefix functions i firebase-admin firebase-functions
  npx firebase emulators:start --only functions,firestore,auth
  npx firebase deploy --only functions,firestore:rules
  ```
- **7.7 Optionnel** : proche aidant (résumé lecture seule, consentement), PIN, chiffrement des champs sensibles.

## 8. Définition de « terminé » (par phase)

Marche **hors ligne** (mode avion) puis se synchronise ; données propres après plusieurs allers-retours réseau ; aucun doublon de prise ; tests unitaires de la logique de planning verts ; tests de règles verts ; Lighthouse PWA toujours ≥ 90 ; récap : ce qui marche, comment tester, ce qui reste.
