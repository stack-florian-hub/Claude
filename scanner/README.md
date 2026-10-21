# Scanner d’anomalies de prix immobiliers (marchand de biens)

Outil de travail du groupe TUÉ et Fils : il croise les **annonces de vente des agences et des notaires** avec l’**historique des ventes réelles (DVF)** pour repérer les biens dont la **somme des lots revendus séparément** dépasse nettement le prix affiché (le modèle du coup New Port, résidence New Port à Saint-Gilles-Croix-de-Vie : appartement + garage + parking + cave vendus en un seul lot).

Deux façons de l’utiliser :
- **L’artefact** (page claude.ai, rien à installer) : mis à jour **chaque lundi matin** en autonomie (nouvelles annonces AJP, Century 21, Laforêt et Immonot, baisses de prix, annonces retirées, nouvelles ventes DVF dès leur publication). Vos statuts, notes, checklist, pipeline et réglages sont gardés dans la base de l’artefact.
- **L’application locale** (ce dossier) : même interface, plus la collecte à la demande, le géocodage et l’import de fichiers DVF.

- **Réseaux** : 15 grands réseaux d’agences à pignon sur rue (AJP, Century 21, Orpi, Laforêt, Guy Hoquet, ERA, Stéphane Plaza, Square Habitat, Nestenn, Citya, Foncia, Arthurimmo, L’Adresse, CIMM, La Résidence) et 3 canaux notariaux (Immonot, Immobilier.notaires.fr, 36h immo). **Collecte automatique : AJP** (41 agences dans le 44 / 85 / 49 / 37), **Century 21**, **Laforêt** et **Immonot** (offices notariaux), sur les pages autorisées par leur robots.txt ; les autres sont reconnus quand vous collez ou capturez une de leurs annonces. Écart médian au marché DVF par réseau et par agence.

- **Marchés** : vos communes comparées sur la DVF (€/m², tendance 2023→2025, liquidité, dépendances, **prime de revente séparée**) pour savoir où chasser les lots groupés.
- **Entrepôts & locaux** (onglet dédié) : entrepôts, locaux d’activité et murs commerciaux à vendre, collectés sur **BureauxLocaux** (adresse précise), **Arthur Loyd** (prix « sur demande » reconstitué depuis le prix au m² hors droits, TVA ajoutée pour le neuf) et **Immonot** (murs commerciaux des notaires, fonds de commerce seuls écartés). Valeur = €/m² des ventes DVF de locaux de surface proche (±50 %, quantiles prudents 25/45/65 %) ; rendement brut affiché quand un loyer est cité. Sans adresse dans une commune hétérogène, pas d’alerte.
- **Appartements / Maisons** (anciennement Opportunités) : liste triée par score d’anomalie, filtres (département, ville, budget 70 k€ ou élargi, type de lot, gain minimal, ancienneté), export CSV. Les annonces dont le prix dépasse la valeur estimée (écart négatif) sont masquées par défaut. Chaque annonce affiche ses **red flags** (toiture, infiltrations, humidité, fissures, mérule, amiante, assainissement, zone inondable, procédure en copropriété…).
- **Fiche opportunité** : valeur de revente lot par lot (bas / moyen / haut), calcul détaillé du gain, comparables DVF de la rue et de la commune, historique des baisses de prix, checklist achat-revente, simulateur (cash-flow mensuel, TRI, BFR, rotation possible avec la trésorerie).
- **Pipeline** : repéré → visité → offre → signé → revente lot par lot → clos, cash engagé, gains prévus vs réalisés.
- **Trésorerie** : cash disponible, cash bloqué par phase, ventes à venir (impact de chaque sortie, ex. garage New Port), trajectoire 12-36 mois selon scénarios.
- **Groupe** : portefeuille d’activités, matrice BCG, 5 forces de Porter, SWOT, arbitrage des 70 k€ et trajectoire 24 mois.
- **Paramètres** : frais, seuils, fiscalité, zones (codes postaux, communes, tension), DVF chargée, connecteurs.

Architecture et modèle de données : [ARCHITECTURE.md](ARCHITECTURE.md).

## Installation et lancement

Prérequis : **Node.js 20 ou plus** (https://nodejs.org). Aucune base de données ni abonnement.

**Le plus simple** : double-cliquer sur `Lancer le scanner (Windows).bat` ou `Lancer le scanner (Mac).command`. Au premier lancement, ils installent l’outil, téléchargent la DVF des départements 44, 85, 49 et 37, puis ouvrent le navigateur. Après une mise à jour du code, supprimer le dossier `.next` pour forcer la reconstruction.

En ligne de commande :

```bash
cd scanner
npm install
npm run dev          # http://localhost:3000
```

Au premier lancement, la base locale (`data/db/*.json`) est créée avec le **jeu de démo** : 22 annonces fictives sur les zones cibles, dont une reproduction **fictive** du coup New Port (4 lots au 42 avenue Notre-Dame, Saint-Gilles-Croix-de-Vie, ~180 k€ de sous-évaluation), et 4 opérations dans le pipeline. Une DVF **fictive** de démonstration est utilisée tant que la vraie DVF n’est pas chargée (bandeau orange en haut des Opportunités).

Version optimisée (plus rapide au quotidien) : `npm run build` puis `npm start`.

Vérifier le scoring : `npm test` (contrôle que New Port ressort avec ~180 k€ d’écart, que la lecture d’annonce détecte les lots groupés, etc. ; si la vraie DVF de la Vendée est chargée, vérifie aussi New Port sur données réelles).

Fiche marché en ligne de commande : `npm run dvf:marche` (toutes les communes des zones) ou `npm run dvf:marche -- 44109 85194`.

## Charger la vraie DVF (gratuit, data.gouv.fr)

**Méthode recommandée : téléchargement automatique par département** (fichiers « géo-DVF » d’Etalab, géolocalisés) :

```bash
npm run dvf:fetch -- 44 85 49 37                       # 3 années précédentes + année en cours si publiée
npm run dvf:fetch -- 44 85 --years 2022,2023,2024,2025  # années au choix
```

Les fichiers bruts sont gardés dans `data/raw/`, l’index compact dans `data/dvf/<dépt>.json` (quelques Mo par département). Relancer la commande deux fois par an (avril et octobre, dates de mise à jour de la DVF). Dès qu’un département a sa vraie DVF, la démo n’est plus utilisée pour lui.

**Alternative : fichier DVF brut** (`ValeursFoncieres-2024.txt`, séparateur `|`, téléchargeable sur https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres/) :

```bash
npm run dvf:import -- ~/Téléchargements/ValeursFoncieres-2024.txt --dept 44,85,49,37
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

5. **Collecte automatique** : `npm run collect` parcourt en parallèle les 41 agences AJP, les listes départementales Century 21 et Laforêt et les annonces notariales Immonot (pages autorisées par robots.txt, 1 requête par seconde et par site, fiches en cache ; `--networks ajp,immonot` pour en choisir), ajoute les nouvelles annonces, enregistre les changements de prix et marque les annonces disparues (« retirées du marché »). Compter 30 à 60 minutes au premier passage. Les adresses sont géocodées (Base Adresse Nationale, gratuite) pour trouver les ventes à moins de 300 m. Tout se corrige ensuite dans la fiche : lots, surfaces, valeur forcée d’un lot (offre reçue), baisses de prix, estimation externe.

## Comment le score est calculé

Pour chaque lot, comparables du plus local au plus large (même type, surface ±40 %, 3 dernières années) : **même rue** (3 ventes), **< 300 m** (3 ventes), **< 800 m** (5 ventes), commune (5 ventes), département (confiance faible), sinon valeurs par défaut selon la tension de la zone. Bas / moyen / haut = 1er quartile / médiane / 3e quartile. Les rayons supposent l’adresse géocodée (automatique à l’import, bouton dans la fiche sinon) : **c’est indispensable dans les communes hétérogènes**. Sans adresse précise dans une commune hétérogène (Nantes, Les Sables…), l’estimation se place en bas de fourchette (P15 / P35 / P60) ; sans vente dans la commune, on prend les ventes à moins de 10 km avant le département.

Les annonces non comparables sont repérées dans le texte et **ne déclenchent pas d’alerte** : résidences gérées (seniors, étudiants, tourisme, LMNP, loyer garanti), viager, nue-propriété, local commercial. Un bien vendu loué prend une décote de 13 %.

Toutes les ventes d’un logement sont utilisées, y compris celles qui incluent un garage ou une cave : on retranche alors une valeur forfaitaire par dépendance (1er quartile des dépendances vendues seules de la commune, entre 3 et 15 k€). Ne garder que les ventes « sans dépendance » biaiserait vers les immeubles anciens et les quartiers moins chers.

Garages, parkings, caves : DVF les enregistre tous comme « Dépendance », sans surface, avec parfois des remises ou des chais. Calibrage prudent sur les dépendances vendues seules à proximité : garage = quantiles 25/45/65 %, parking = 10/25/40 %, plafonnés à 1,2 × (milieu) et 1,6 × (haut) la valeur haute de la zone ; la cave reste bornée par les valeurs par défaut. Hypothèse affichée dans la fiche ; la remplacer par une valeur forcée dès qu’on a mieux (prix d’un box voisin, avis d’agent).

La fiche donne aussi l’**offre maximale** (ou l’enchère maximale) : le prix d’achat au-delà duquel le gain passe sous vos seuils, et le prix d’équilibre.

```
gain brut = Σ lots × (1 − agence 4 %) − prix − frais d’acquisition (7,5 %) − travaux − diagnostics − division éventuelle − portage
alerte    = gain brut > 30 000 € ou > 25 % du prix affiché
score     = marge % (35) + gain € (35) + confiance DVF (10) + signaux (10 : lot groupé, baisse de prix, vente judiciaire, ancienneté, vendeur pressé) + liquidité (10)
            − 4 par red flag grave (max 12), × 1,15 si le projet (prix + frais + travaux) ≤ 150 k€, × 0,85 à 1 entre 150 et 250 k€, × 0,6 au-delà
travaux   = saisis, sinon estimés : rénovation complète 1 000 €/m², rafraîchissement 300 €/m², remise au goût du jour 150 €/m² par défaut
            (sauf bien annoncé refait), + toiture, électricité, humidité, assainissement cités dans l’annonce
```

Tous les seuils et frais se règlent dans Paramètres (dont le régime marchand de biens à ~2,5 % de frais : l’achat-revente est porté par la Financière TUÉ et Fils, dont les statuts prévoient l’activité).

## Artefact et mise à jour du lundi

```bash
npm run collect               # annonces AJP
npm run artifact:build        # artifact/dist/index.html + artifact/dist/data.json
```

La routine du lundi (5 h 33, heure de Paris) fait dans une session Claude Code distante : restauration de la semaine précédente depuis le `data.json` publié (`npm run artifact:restore`), `npm run dvf:fetch -- 44 85 49 37 --refresh`, `npm run collect`, `npm run artifact:build`, puis republication de l’artefact à la même adresse. Rien n’est poussé sur git.

## Brancher d’autres sources plus tard

- Annonces : implémenter l’interface `ListingProvider` (`src/lib/providers/listing.ts`) avec une méthode `fetch(zones)` et l’ajouter à `LISTING_PROVIDERS`.
- Valorisation : implémenter `ValuationProvider` (`src/lib/providers/valuation.ts`). Castorus premium (historique des prix affichés) et MeilleursAgents sont déjà prévus comme connecteurs désactivés.

## Sauvegarde

Toutes les données sont dans `scanner/data/db/` (annonces, opérations, paramètres, zones) : copier ce dossier suffit. Il n’est pas versionné dans git.

## Limites connues

- La DVF a environ 6 mois de retard et ne contient pas l’Alsace-Moselle ni Mayotte.
- Le calcul d’IS est fait par opération (en réalité sur le résultat annuel de la société) ; TVA sur marge activable mais à valider avec l’expert-comptable.
- La lecture automatique d’annonces repose sur des expressions régulières : toujours relire les lots détectés.
