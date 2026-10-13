# Scanner d’anomalies de prix immobiliers (marchand de biens)

Outil de travail local pour le groupe TUÉ et Fils : il croise les **annonces de vente** avec l’**historique des ventes réelles (DVF)** pour repérer les biens dont la **somme des lots revendus séparément** dépasse nettement le prix affiché (le modèle du coup New Port : appartement + garage + parking + cave vendus en un seul lot).

- **Marchés** : vos communes comparées sur la DVF (€/m², tendance 2023→2025, liquidité, dépendances, **prime de revente séparée**) pour savoir où chasser les lots groupés.
- **Opportunités** : liste triée par score d’anomalie, filtres (département, ville, budget 70 k€ ou élargi, type de lot, gain minimal, ancienneté), export CSV.
- **Fiche opportunité** : valeur de revente lot par lot (bas / moyen / haut), calcul détaillé du gain, comparables DVF de la rue et de la commune, historique des baisses de prix, checklist achat-revente, simulateur (cash-flow mensuel, TRI, BFR, rotation possible avec la trésorerie).
- **Pipeline** : repéré → visité → offre → signé → revente lot par lot → clos, cash engagé, gains prévus vs réalisés.
- **Trésorerie** : cash disponible, cash bloqué par phase, ventes à venir (impact de chaque sortie, ex. garage New Port), trajectoire 12-36 mois selon scénarios.
- **Groupe** : portefeuille d’activités, matrice BCG, 5 forces de Porter, SWOT, arbitrage des 70 k€ et trajectoire 24 mois.
- **Paramètres** : frais, seuils, fiscalité, zones (codes postaux, communes, tension), DVF chargée, connecteurs.

Architecture et modèle de données : [ARCHITECTURE.md](ARCHITECTURE.md).

## Installation et lancement

Prérequis : **Node.js 20 ou plus** (https://nodejs.org). Aucune base de données ni abonnement.

**Le plus simple** : double-cliquer sur `Lancer le scanner (Windows).bat` ou `Lancer le scanner (Mac).command`. Au premier lancement, ils installent l’outil, téléchargent la DVF des départements 44, 85, 49, 37 et 78, puis ouvrent le navigateur. Après une mise à jour du code, supprimer le dossier `.next` pour forcer la reconstruction.

En ligne de commande :

```bash
cd scanner
npm install
npm run dev          # http://localhost:3000
```

Au premier lancement, la base locale (`data/db/*.json`) est créée avec le **jeu de démo** : 22 annonces fictives sur les zones cibles, dont la reproduction du coup New Port (4 lots à Saint-Germain-en-Laye, ~180 k€ de sous-évaluation), et 4 opérations dans le pipeline. Une DVF **fictive** de démonstration est utilisée tant que la vraie DVF n’est pas chargée (bandeau orange en haut des Opportunités).

Version optimisée (plus rapide au quotidien) : `npm run build` puis `npm start`.

Vérifier le scoring : `npm test` (contrôle que New Port ressort avec ~180 k€ d’écart, que la lecture d’annonce détecte les lots groupés, etc. ; si la vraie DVF du 78 est chargée, vérifie aussi la valorisation au quartier sur données réelles).

Fiche marché en ligne de commande : `npm run dvf:marche` (toutes les communes des zones) ou `npm run dvf:marche -- 44109 85194`.

## Charger la vraie DVF (gratuit, data.gouv.fr)

**Méthode recommandée : téléchargement automatique par département** (fichiers « géo-DVF » d’Etalab, géolocalisés) :

```bash
npm run dvf:fetch -- 44 85 49 37 78                    # 3 dernières années disponibles
npm run dvf:fetch -- 44 85 --years 2022,2023,2024,2025  # années au choix
```

Les fichiers bruts sont gardés dans `data/raw/`, l’index compact dans `data/dvf/<dépt>.json` (quelques Mo par département). Relancer la commande deux fois par an (avril et octobre, dates de mise à jour de la DVF). Dès qu’un département a sa vraie DVF, la démo n’est plus utilisée pour lui.

**Alternative : fichier DVF brut** (`ValeursFoncieres-2024.txt`, séparateur `|`, téléchargeable sur https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres/) :

```bash
npm run dvf:import -- ~/Téléchargements/ValeursFoncieres-2024.txt --dept 44,85,49,37,78
npm run dvf:import -- ~/Téléchargements/44.csv.gz       # ou un CSV géo-DVF déjà téléchargé
```

Ce qui est gardé : les ventes (et adjudications) d’**un seul** appartement, maison ou local (pour un €/m² propre) et les ventes de **dépendances seules** (garages, parkings, caves : DVF ne les distingue pas, voir ci-dessous). Les ventes de plusieurs logements ensemble sont écartées.

Pour désactiver complètement la démo : Paramètres → décocher « Utiliser la DVF de démonstration », puis « Retirer la démo ».

## Ajouter des annonces

Écran **Import d’annonces** :

1. **Coller du texte** : copier le texte d’une annonce (SeLoger, Leboncoin, Logic-Immo, Bien’ici, PAP, AJP…) et le coller. Plusieurs annonces : séparer par une ligne `---`. L’outil lit prix, surface, adresse, code postal, DPE, charges, nombre de lots de copro, type de vendeur, et **détecte les lots vendus ensemble** (cave, garage, box, parking ; il ignore « parking visiteurs », « proche parking », etc.).
2. **Capture navigateur** : installer le favori « Capturer l’annonce », ouvrir une annonce, cliquer : le texte affiché est envoyé à l’outil. C’est un copier-coller déclenché à la main, page par page (pas de robot qui parcourt les sites, conformément à leurs conditions d’utilisation).
3. **CSV / JSON** : modèle téléchargeable dans l’écran (exemple : `data/demo/annonces-exemple.csv`). La colonne `lots` décrit un lot groupé : `appartement:58:3|cave|parking` (type:surface:pièces).
4. **Saisie manuelle**.

Chaque import affiche un aperçu analysé avant enregistrement. Une annonce **déjà connue** (même URL, ou même code postal + même type + surface à ±3 %, y compris vue sur un autre site) n’est pas dupliquée : si son prix a changé, le nouveau prix entre dans l’historique (signal de baisse) et le site supplémentaire est noté. Recoller régulièrement les annonces suivies suffit donc à suivre leurs baisses.

5. **Ventes judiciaires (Licitor)** : onglet dédié qui lit le `licitor.json` de la veille du dépôt (`veille/licitor.py`). Ces annonces sont masquées par défaut dans Opportunités (filtre « Licitor ») car elles sont suivies dans l’application dédiée. Les adresses sont géocodées (Base Adresse Nationale, gratuite) pour trouver les ventes à moins de 300 m. Tout se corrige ensuite dans la fiche : lots, surfaces, valeur forcée d’un lot (offre reçue), baisses de prix, estimation externe.

## Comment le score est calculé

Pour chaque lot, comparables du plus local au plus large (même type, surface ±40 %, 3 dernières années) : **même rue** (3 ventes), **< 300 m** (3 ventes), **< 800 m** (5 ventes), commune (5 ventes), département (confiance faible), sinon valeurs par défaut selon la tension de la zone. Bas / moyen / haut = 1er quartile / médiane / 3e quartile. Les rayons supposent l’adresse géocodée (automatique à l’import, bouton dans la fiche sinon) : **c’est indispensable dans les communes hétérogènes**. Exemple réel à Saint-Germain-en-Laye : 7 177 €/m² médian à moins de 300 m du centre contre 5 933 €/m² sur toute la commune.

Toutes les ventes d’un logement sont utilisées, y compris celles qui incluent un garage ou une cave : on retranche alors une valeur forfaitaire par dépendance (1er quartile des dépendances vendues seules de la commune, entre 3 et 15 k€). Ne garder que les ventes « sans dépendance » biaiserait vers les immeubles anciens et les quartiers moins chers.

Garages, parkings, caves : DVF les enregistre tous comme « Dépendance », sans surface, avec parfois des remises ou des chais. Calibrage prudent sur les dépendances vendues seules à proximité : garage = quantiles 25/45/65 %, parking = 10/25/40 %, plafonnés à 1,2 × (milieu) et 1,6 × (haut) la valeur haute de la zone ; la cave reste bornée par les valeurs par défaut. Hypothèse affichée dans la fiche ; la remplacer par une valeur forcée dès qu’on a mieux (prix d’un box voisin, avis d’agent).

La fiche donne aussi l’**offre maximale** (ou l’enchère maximale) : le prix d’achat au-delà duquel le gain passe sous vos seuils, et le prix d’équilibre.

```
gain brut = Σ lots × (1 − agence 4 %) − prix − frais d’acquisition (7,5 %) − travaux − diagnostics − division éventuelle − portage
alerte    = gain brut > 30 000 € ou > 25 % du prix affiché
score     = marge % (35) + gain € (35) + confiance DVF (10) + signaux (10 : lot groupé, baisse de prix, vente judiciaire, ancienneté, vendeur pressé) + liquidité (10)
```

Tous les seuils et frais se règlent dans Paramètres (dont le régime marchand de biens à ~2,5 % de frais, à n’activer qu’une fois l’objet social formalisé).

## Brancher d’autres sources plus tard

- Annonces : implémenter l’interface `ListingProvider` (`src/lib/providers/listing.ts`) avec une méthode `fetch(zones)` et l’ajouter à `LISTING_PROVIDERS`.
- Valorisation : implémenter `ValuationProvider` (`src/lib/providers/valuation.ts`). Castorus premium (historique des prix affichés) et MeilleursAgents sont déjà prévus comme connecteurs désactivés.

## Sauvegarde

Toutes les données sont dans `scanner/data/db/` (annonces, opérations, paramètres, zones) : copier ce dossier suffit. Il n’est pas versionné dans git.

## Limites connues

- La DVF a environ 6 mois de retard et ne contient pas l’Alsace-Moselle ni Mayotte.
- Le calcul d’IS est fait par opération (en réalité sur le résultat annuel de la société) ; TVA sur marge activable mais à valider avec l’expert-comptable.
- La lecture automatique d’annonces repose sur des expressions régulières : toujours relire les lots détectés.
