# LifeHub

Application web installable (PWA) qui centralise le quotidien : habitudes, dépenses, tâches et maison partagée. Elle fonctionne hors ligne et se synchronise dès que le réseau revient. Interface en français, montants en FCFA.

**En ligne :** https://lifehub-jade-ten.vercel.app (accès réservé : compte admin et colocataires invités).

## Fonctionnalités

- **Aujourd'hui** : la journée en un écran (habitudes, objectifs, tâches dues, factures proches, dépense du jour et budget restant) et une revue de la semaine.
- **Habitudes** : grille mensuelle à cocher, progression par jour et par semaine, anneau global, meilleures habitudes, humeur et sommeil.
- **Dépenses** : saisie rapide, catégories avec budget mensuel, graphiques, dépenses récurrentes.
- **Tâches** : 1 à 5 objectifs du jour, tâches avec priorité, échéance, récurrence et rappels.
- **Maison**, partagée avec des colocataires : stock avec seuil, menu de la semaine, factures, liste de courses générée depuis le stock.
- **Plus** : dettes et prêts, notes rapides, export et import des données en JSON.

Seul l'admin voit les modules personnels. Un colocataire invité n'accède qu'à la Maison.

## Stack

| Partie    | Technologies                                                                               | Hébergement |
| --------- | ------------------------------------------------------------------------------------------ | ----------- |
| Front     | HTML, CSS et JavaScript sans framework, Vite, vite-plugin-pwa, graphiques SVG faits maison | Vercel      |
| Connexion | Firebase Auth (Google uniquement)                                                          | Firebase    |
| API       | Node, Fastify, vérification des jetons Firebase avec `jose`                                | Render      |
| Données   | Postgres ; IndexedDB côté navigateur pour le hors ligne                                    | Neon        |

Tout tient dans les offres gratuites de ces services.

## Démarrer en local

Prérequis : Node 24 et la CLI Firebase (`npm i -g firebase-tools`).

```bash
npm ci && npm --prefix api ci
cp .env.example .env && cp api/.env.example api/.env   # puis renseigner
npm run emulators    # émulateur Firebase Auth
npm run dev:api      # API sur http://127.0.0.1:8787 (base PGlite locale)
npm run dev          # front sur http://127.0.0.1:7070
```

En local, la connexion passe par l'émulateur : aucun compte Google réel n'est nécessaire.

## Qualité

```bash
npm run check        # lint + tests front + tests API
```

## Organisation du code

```
src/        front : vues, composants, accès aux données (repos/), synchronisation hors ligne (sync/)
api/        API : routes, droits par rôle, validation, migrations SQL
public/     icônes et favicon
scripts/    génération des icônes PWA
```

## Documentation

- [DEPLOIEMENT.md](DEPLOIEMENT.md) : services en production, variables d'environnement, réglages de sécurité, procédures (changer de domaine, de mot de passe Neon).
- [CLAUDE.md](CLAUDE.md) : cahier des charges complet (modèle de données, rôles, sécurité, phases).
