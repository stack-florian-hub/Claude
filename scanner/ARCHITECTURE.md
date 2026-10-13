# Architecture du scanner d'anomalies

Proposition validée avant le code, puis livrée en 4 étapes (un commit par étape) :
(1) ingestion + scoring DVF, (2) dashboard opportunités, (3) pipeline + trésorerie, (4) écran Groupe.

## 1. Principes

- **Local d'abord** : Next.js 14 (App Router) + TypeScript, aucune base à installer. Les données vivent dans des fichiers JSON sous `data/` (lisibles, versionnables, sauvegardables par simple copie).
- **Aucune dépendance payante** : DVF (data.gouv.fr) est la source de vérité des valeurs de revente. Castorus premium et MeilleursAgents sont des connecteurs prévus mais désactivés.
- **Sources interchangeables** : deux interfaces, `ListingProvider` (d'où viennent les annonces) et `ValuationProvider` (combien vaut chaque lot). Ajouter une API ou un scraper revient à écrire une classe de plus.
- **Calcul transparent** : chaque estimation porte sa source (DVF rue / commune / département / valeur par défaut), son nombre de comparables et son niveau de confiance. Les hypothèses sont modifiables dans Paramètres.

## 2. Arborescence

```
scanner/
├─ data/
│  ├─ db/                  base locale (JSON) : listings, deals, settings, zones  [ignoré par git]
│  ├─ dvf/<dept>.json      index DVF compact par département, construit par les scripts  [ignoré]
│  ├─ raw/                 fichiers DVF bruts téléchargés  [ignoré]
│  └─ demo/                jeu de démo versionné (annonces, DVF fictif, pipeline)
├─ scripts/
│  ├─ dvf-fetch.ts         télécharge geo-dvf (data.gouv) par département et construit l'index
│  ├─ dvf-import.ts        importe un fichier DVF brut (ValeursFoncieres-AAAA.txt) ou un CSV geo-dvf local
│  ├─ seed-demo.ts         (ré)initialise la base avec le jeu de démo
│  └─ selftest.ts          vérifie le scoring sur le cas New Port
└─ src/
   ├─ lib/
   │  ├─ types.ts          MODÈLE DE DONNÉES (ci-dessous)
   │  ├─ store.ts          lecture/écriture JSON atomique
   │  ├─ defaults.ts       paramètres et zones par défaut
   │  ├─ dvf.ts            chargement de l'index DVF, sélection des comparables
   │  ├─ detect.ts         analyse de texte d'annonce, détection des lots groupés
   │  ├─ scoring.ts        valeur par lot, coûts, gain, score d'anomalie
   │  ├─ simulation.ts     simulation A/R mensuelle, TRI, BFR, rotation
   │  ├─ treasury.ts       trajectoire de cash, allocation, scénarios
   │  ├─ group.ts          Porter, BCG, SWOT, arbitrage
   │  ├─ csv.ts            parse/export CSV (séparateur ; ou ,)
   │  └─ providers/
   │     ├─ listing.ts     ListingProvider : manuel, collage texte, CSV, JSON (+ futur API/scraping)
   │     └─ valuation.ts   ValuationProvider : DVF, manuel, Castorus (stub), MeilleursAgents (stub)
   ├─ app/                 écrans : opportunites, opportunites/[id], import, pipeline, tresorerie, groupe, parametres
   │  └─ api/              routes JSON : listings, deals, settings, import, geocode, export
   └─ components/          tableaux, graphiques SVG maison (pas de librairie de graphes)
```

## 3. Modèle de données (résumé de `src/lib/types.ts`)

| Entité | Champs clés | Rôle |
|---|---|---|
| `Listing` | source, url, titre, description, `price`, `priceHistory[]`, adresse (CP, commune, INSEE, dept, lat/lon), `lots[]`, DPE, charges, copro, vendeur, date de publication, statut | Une annonce. **Toujours composée de lots** : une annonce simple = 1 lot, un lot groupé = n lots. |
| `SubLot` | type (appartement, maison, garage, parking, cave, local, terrain), surface, pièces, travaux, revente forcée | Unité revendable séparément. Cœur du modèle New Port. |
| `LotValuation` | low / mid / high, €/m², source, nb de comparables, confiance, comparables[] | Valeur de revente séparée d'un lot. |
| `Analysis` | Σ lots (low/mid/high), frais d'acquisition, travaux, coûts de revente, gain brut, ratio, score 0-100, alertes | Résultat du scoring, recalculé à la volée (jamais stocké : change avec DVF et les paramètres). |
| `Deal` | étape (repéré → visité → offert → signé → revente → clos), société, prix, frais, travaux, financement, lots de revente (prévu / réalisé / date), mouvements | Une opération suivie dans le Pipeline. |
| `Zone` | nom, dept, codes postaux, communes, tension (1-3), priorité, active | Paramétrage des secteurs scannés. |
| `Settings` | frais (notaire droit commun / régime MdB, agence revente, diagnostics, division), seuils (gain 30 k€, 25 %), budget, financement, valeurs par défaut garage/parking/cave par tension, fiscalité (IS, TVA sur marge), trésorerie, données Groupe | Toutes les hypothèses modifiables. |
| `DvfMutation` | date, valeur, type (A/M/D/L), surface, pièces, nb dépendances, CP, INSEE, voie, lat/lon | Index DVF compact (1 ligne par mutation mono-type). |

## 4. Scoring

```
Σ lots          = somme des valeurs de revente séparées (bas / moyen / haut)
frais achat     = prix × % notaire (7,5 % droit commun, ~2,5 % régime MdB engagement de revendre)
coûts revente   = Σ lots × % agence (4 %) + diagnostics par lot + division/EDD si nécessaire
gain brut       = Σ lots − prix − frais achat − travaux − coûts revente
ratio           = (Σ lots − frais achat − travaux − coûts revente) / prix      (> 1 = rentable)
alerte          = gain brut > 30 000 € OU gain brut / prix > 25 %
score 0-100     = 35 × marge % (plafonnée à 40 %) + 35 × gain € (plafonné à 100 k€)
                + 10 × confiance DVF + 10 × signaux (lot groupé, baisse de prix, vente judiciaire, ancienneté)
                + 10 × liquidité (ville tendue, petits lots faciles à revendre)
```

Valeur d'un lot, par ordre de préférence :
1. Valeur forcée saisie (ex. offre reçue, estimation pro).
2. **DVF même rue** (≥ 3 ventes du même type, surface ±40 %, 3 dernières années) : P25 / médiane / P75 du €/m² × surface.
3. **DVF même code postal / commune** (≥ 5 ventes).
4. **DVF département** (confiance faible).
5. Valeurs par défaut selon la tension de la zone (garage 15-30 k€, parking 10-20 k€, cave 3-8 k€).

Garages, parkings et caves : DVF les note « Dépendance » sans surface ni distinction. On calibre sur les ventes de dépendance seule de la commune : parking = P20-P50, garage = P40-P80, cave = valeur par défaut bornée (les caves se vendent rarement seules). Hypothèse affichée comme telle.

## 5. Connecteurs futurs

- `ListingProvider` : `fetch()` → `ListingInput[]`. Existants : collage de texte, CSV, JSON, saisie manuelle, bookmarklet (capture de la page affichée dans le navigateur, déclenchée par l'utilisateur). À brancher : API d'agrégateur, flux AJP, Licitor (déjà couvert par `../veille/`).
- `ValuationProvider` : `valueLot(listing, lot)` → `LotValuation | null`. Existants : DVF, manuel. Stubs : Castorus (historique des prix affichés), MeilleursAgents. Activation dans Paramètres → Connecteurs.
