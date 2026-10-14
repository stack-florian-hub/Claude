# Veille foncière 85 · 44 · 49 · 37

Outil de veille et d'analyse des terrains à petit prix (loisir, bois, agricole, étang, constructible sous-évalué) en
Vendée, Loire-Atlantique, Maine-et-Loire et Indre-et-Loire. Il agrège les annonces, écarte les faux prix et les
ventes de parts, croise chaque terrain avec l'open data (DVF, cadastre, PLU, risques), calcule un **score
d'opportunité sur 100** et affiche le tout dans un dashboard React (carte, tableau, fiche détaillée, notes).

```
veille-fonciere/
├── backend/                  Python 3.10+ (requests, beautifulsoup4 ; Playwright en option)
│   ├── config.json           seuils de prix, pondérations, sources actives, délais
│   ├── schema.sql            schéma SQLite (tables annonces, enrichissements, scores, dvf_*, notes…)
│   ├── vf/
│   │   ├── collectors/       un collecteur par source (api.py : notaires, Bien'Ici ; sites.py : HTML/JS)
│   │   ├── filters.py        seuils + analyse sémantique (faux prix, viager, GFF, indivision…)
│   │   ├── enrich.py         cadastre, PLU/GPU, Natura 2000/ZNIEFF, Géorisques, BD TOPO, DVF
│   │   ├── dvf.py            comparables DVF du foncier non bâti
│   │   ├── scoring.py        score /100 et explications
│   │   ├── pipeline.py       orchestration + export JSON
│   │   └── server.py         serveur local (dashboard + API des notes)
│   └── tests/                python -m unittest
└── frontend/                 React 18 + Vite + Tailwind + Leaflet
    ├── public/data/opportunites.json   export lu par le dashboard (instantané réel du 14/10/2026 inclus)
    └── src/                  App, Filtres, CarteView, TableauView, Fiche, Exclues
```

## Démarrage rapide

```bash
# 1. Backend
cd veille-fonciere/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m vf init
python -m vf tout -s notaires,bienici,paruvendu      # collecte + enrichissement + score + export

# 2. Dashboard
cd ../frontend
npm install
npm run build
cd ../backend && python -m vf serve                  # http://localhost:8765
```

En développement : `python -m vf serve` dans un terminal, `npm run dev` dans `frontend/` (Vite relaie `/api` vers le
serveur Python). Sans serveur Python, le dashboard fonctionne aussi en statique (`npm run preview`) : il lit
`public/data/opportunites.json` et garde les notes dans le navigateur.

### Commandes

| Commande | Effet |
|---|---|
| `python -m vf collecter [-s notaires,bienici] [-d 85,44]` | collecte les sources (toutes celles de `sources_actives` par défaut) |
| `python -m vf importer annonces.csv` | importe des annonces saisies à la main ou exportées d'un autre site |
| `python -m vf requalifier` | réapplique les filtres après une modification de `config.json` |
| `python -m vf enrichir [--tout] [--id ID]` | open data ; seules les nouvelles annonces par défaut (les API sont mises en cache) |
| `python -m vf scorer` / `exporter` | recalcule les scores / régénère le JSON du dashboard |
| `python -m vf tout` | les quatre étapes à la suite |
| `python -m vf localiser "bienici:xxx" 85147000ZK0123` | fixe la parcelle exacte (IDU cadastral) puis ré-enrichit et ré-exporte |
| `python -m vf serve [-p 8765]` | dashboard + API des notes (`GET /api/opportunites`, `GET/PUT /api/notes/<id>`) |

### Automatiser

```cron
# tous les jours à 7h10 : nouvelles annonces, enrichies, scorées et exportées
10 7 * * * cd /chemin/veille-fonciere/backend && .venv/bin/python -m vf tout >> data/veille.log 2>&1
```

## 1. Sources

| Source | Collecteur | Méthode | État |
|---|---|---|---|
| Immobilier.notaires.fr | `notaires` | API JSON du site (terrains, vente classique + **vente interactive** + **adjudication** notariale) | testé ✔ |
| Enchères-notaires / Notaires de l'Ouest | `notaires` | ces ventes sont diffusées sur immobilier.notaires.fr (types `VNI`, `VAE`) | testé ✔ |
| Bien'Ici | `bienici` | API JSON du site, position floutée (rayon 125 m à 1 km) | testé ✔ |
| ParuVendu | `paruvendu` | HTML : liste → fiches (JSON-LD / balises meta) | testé ✔ |
| LeBonCoin | `leboncoin` | Playwright, JSON `__NEXT_DATA__` de la page de résultats | non testé ici (403) |
| SeLoger, Logic-Immo | `seloger`, `logicimmo` | Playwright, liste → fiches | non testé ici (403) |
| Figaro Immobilier | `figaro` | Playwright, liste → fiches | non testé ici |
| Green-Acres | `greenacres` | Playwright, liste → fiches | non testé ici |
| Proprietes-rurales.com (relais SAFER) | `proprietes_rurales` | Playwright (pages rendues en JS) | non testé ici |
| Agorastore (+ Vencheres, même réseau) | `agorastore` | Playwright | non testé ici |
| Licitation.com | — | le domaine est aujourd'hui **parqué / à vendre** : aucune annonce. Les ventes judiciaires sont couvertes par `veille/licitor.py` du dépôt | — |
| Appels à candidatures SAFER, mairies, bouche-à-oreille | `importer` | CSV/JSON (`url;titre;description;prix;surface_m2;commune;code_postal`) | ✔ |

**À savoir avant d'activer les sources « non testé ici »** : depuis l'environnement où l'outil a été construit, ces
sites renvoient 403 ou exigent JavaScript ; leurs collecteurs suivent les structures publiques connues mais peuvent
nécessiter d'ajuster l'URL de recherche ou le motif de lien. Les URL se surchargent sans toucher au code :

```json
"recherches": {
  "leboncoin": {"85": ["https://www.leboncoin.fr/recherche?category=9&...&locations=..."]}
}
```

(copiez l'URL de votre recherche faite à la main dans le navigateur). Avec Playwright
(`pip install playwright && playwright install chromium`), la fenêtre s'ouvre en mode visible : si un site demande
une vérification humaine, vous la faites vous-même. **Aucune protection anti-robot n'est contournée.** La collecte
respecte `robots.txt` et attend 3 s entre deux pages d'un même site (`config.json > collecte`). Les CGU de LeBonCoin,
SeLoger et Logic-Immo interdisent l'extraction automatisée : réservez ces collecteurs à un usage personnel, à faible
fréquence, ou passez par l'import manuel.

## 2. Filtrage (`vf/filters.py`)

Ordre d'application ; le premier motif rencontré est retenu et visible dans l'onglet **Exclues** du dashboard.

1. **Hors zone** : département ∉ {85, 44, 49, 37}.
2. **Prix plancher** : `< 300 €` (prix d'appel à 1 €, « 100 € » LeBonCoin…).
3. **Prix plafond** : `10 000 €` par défaut, `15 000 €` pour un terrain annoncé constructible (`plafond_par_typologie`).
4. **Surface** hors de `[200 m², 50 ha]`, et **prix/m² > 15 €** pour le non constructible (filtre dynamique au m²).
5. **Analyse sémantique** du titre + description (normalisés : minuscules, sans accents) :
   - `viager` : viager, bouquet + rente ;
   - `gff_parts` : groupement foncier / forestier, GFF, GFA, parts sociales ;
   - `indivision` : en indivision, quote-part, droits indivis, « 1/4 indivis » ;
   - `demembrement` : nue-propriété, usufruit ;
   - `location` : à louer, loyer, « par mois » (sauf bail rural) ;
   - `recherche` : « recherche terrain », « achète » ;
   - `pas_un_terrain` : mobil-home sur emplacement de camping, concession, parking ;
   - `prix_reel_texte` : un montant **> 2,5 × le prix affiché** précédé (40 caractères) de « prix réel », « net vendeur »,
     « faire offre », « à partir de », « au prix de », « mise à prix »… ; ou « prix d'appel / symbolique / indicatif ».
     Un « 1 500 € de frais » ne déclenche rien.
6. **Alertes** (non excluantes, affichées dans la fiche et utilisées par le score) : enclavé, inondable/zone humide,
   bail rural, servitude, ligne HT, « non constructible », viabilisé, accès route, proche bourg, puits/forage, abri.

La typologie (loisir, bois, agricole, étang, constructible, autre) est déduite du texte ; la référence cadastrale est
extraite si l'annonce la cite (« parcelle ZK 123 », « section AB n°45 ») et sert alors à localiser exactement le terrain.

## 3. Enrichissement open data (`vf/enrich.py`, `vf/dvf.py`)

| Donnée | API (publique, sans clé) |
|---|---|
| Localisation : parcelle citée > coordonnées de l'annonce > centre de la commune | API Carto cadastre, API Géo |
| Parcelle, section, contenance | `apicarto.ign.fr/api/cadastre/parcelle` |
| Zone PLU/PLUi au point (U, AUc, AUs, A, N), carte communale, RNU | `apicarto.ign.fr/api/gpu/zone-urba`, `secteur-cc` |
| Distance aux zones U et AU les plus proches (rayon 1,5 km) | idem, géométrie calculée localement |
| Prescriptions (EBC, zone humide, non aedificandi, OAP à < 600 m) | `gpu/prescription-surf` |
| Servitudes d'utilité publique (PPR, lignes électriques, monuments…) | `gpu/assiette-sup-s` |
| Natura 2000 (habitats, oiseaux), ZNIEFF 1 et 2 | `apicarto.ign.fr/api/nature/*` |
| Risques de la commune, PPR inondation, atlas des zones inondables | `georisques.gouv.fr/api/v1/gaspar/*` |
| Accès voie publique (tronçon carrossable le plus proche, < 400 m) | Géoplateforme WFS `BDTOPO_V3:troncon_de_route` |
| Ventes réelles 2021-2025 | `files.data.gouv.fr/geo-dvf` (fichier CSV par commune, mis en cache 30 jours) |

**DVF** : on garde les mutations « Vente » / « Adjudication » d'une seule commune **sans aucun bâti**, classées par
nature de culture dominante (terres/prés → agricole, bois/taillis/peupleraies → bois, agrément/jardins → loisir,
eaux → étang, terrains à bâtir → constructible). La référence est la médiane €/m² des ventes de surface comparable
(÷3 à ×3), au niveau le plus fin disponible : **même section cadastrale** (≥ 5 ventes) → commune → département (cache
local) → repère régional. Les 10 ventes les plus récentes sont listées dans la fiche.

**Précision de position** : `parcelle` (exacte), `adresse`, `approx` (Bien'Ici, rayon ≤ 500 m), `commune` (centre de
la commune). Pour `commune`, zonage et distances ne veulent rien dire : le score de mutation est neutre et la
confiance « faible ». Trouvez la parcelle (photos, Géoportail, vendeur) puis `python -m vf localiser`.

## 4. Score d'opportunité (`vf/scoring.py`)

| Composante | Poids | Calcul |
|---|---|---|
| **Décote vs DVF** | 30 | ratio r = prix/m² ÷ médiane DVF. r ≤ 0,25 → 30 ; r = 1 → 15 ; r ≥ 1,75 → 0 (linéaire). ×0,8 si seul le repère régional est disponible |
| **Potentiel de mutation PLU** | 35 | zone U vendue comme non constructible → 35 ; U vendue comme constructible → 14 (plus-value déjà payée) ; AUc → 33 ; AUs → 28 ; A/N : distance à la zone U/AU la plus proche (≤ 50 m → 35, 200 m → 24, 500 m → 14, ≥ 1,5 km → 0), ×0,85 en zone N, +10 % si OAP à < 600 m. Freins : EBC ×0,5, zone humide ×0,5, non aedificandi ×0,3, Natura 2000 ×0,6, périmètre PPR ×0,4, loi Littoral (< 1,5 km du rivage) ×0,6 (< 100 m : 0). Position approximative : tiré vers le neutre |
| **Accessibilité & usage** | 20 | route publique ≤ 15 m → 8, ≤ 50 m → 6, ≤ 150 m → 3 ; réseaux probables (zone U ≤ 100 m ou annonce « viabilisé ») → 5 ; contraintes 7 points moins : PPR au point −5, PPRi communal −1, inondable −3, enclavé −4, zone humide −3, ligne électrique −1, bail rural −2, Natura 2000 −2 |
| **Rareté / emplacement** | 15 | littoral (85/44) : ≤ 2 km → 10, 5 km → 8, 15 km → 5, 25 km → 1,5 ; agglomération pondérée (Nantes, Angers, Tours = 1 ; Saint-Nazaire, La Roche, Les Sables = 0,8 ; Cholet, Saumur, Ancenis, Amboise, Challans, Montaigu = 0,6–0,7) ; score = max + ½ min, plafonné |

Les poids et seuils sont dans `config.json > scoring`. Chaque règle déclenchée produit une phrase dans la fiche, pour
que le score soit toujours vérifiable. **Confiance** : haute (parcelle/adresse + DVF section ou commune + aucune API en
échec), faible (position communale ou surface inconnue), moyenne sinon.

Le score est une aide au tri, pas un avis : un passage en zone constructible dépend de la révision du PLU(i), du SCoT,
de l'objectif « zéro artificialisation nette » (ZAN) qui réduit fortement les ouvertures à l'urbanisation d'ici 2031
puis 2050, et de la loi Littoral. Avant toute offre : certificat d'urbanisme, règlement de zone, appel au service
urbanisme de la mairie / intercommunalité (calendrier de révision du PLUi), droit de préemption SAFER et du fermier.

## 5. Dashboard

- **Carte** : fonds OpenStreetMap, plan IGN, photo aérienne IGN, couche cadastre ; un point par terrain, couleur =
  palier de score (bleu clair → foncé), contour pointillé = position approximative. Survol : commune, prix, surface.
- **Tableau** : tri par score, prix, surface, €/m², ratio vs DVF, distance zone U/AU, date… ; filtres département,
  typologie, source, prix min/max, surface, €/m² max, score min, confiance, suivi, favoris, recherche texte.
- **Fiche** : lien vers l'annonce, décomposition et explications du score, alertes, urbanisme, risques, comparables DVF,
  historique du prix, liens Géoportail / Géoportail de l'urbanisme / Géorisques / DVF, **note personnelle**, statut de
  suivi (à voir, contacté, visité, offre, abandonné) et favori. Notes enregistrées dans SQLite via `vf serve`, ou dans
  le navigateur sinon.
- **Exclues** : annonces écartées avec leur motif, pour vérifier le filtrage.

### Version publiée (artefact claude.ai)

`artifact/` produit une page autonome publiée sur https://claude.ai/artifact/4zgfqzSN1R2JKTnwhpZT4W :
`python3 artifact/build_artifact.py` après un `python -m vf exporter`, puis republier le fichier
`artifact/veille-fonciere.html`. Les tuiles et photos externes étant bloquées dans un artefact, la carte affiche les
contours des départements ; les notes sont enregistrées dans la base de l'artefact (collection `notes`).

## 6. Base de données

`backend/schema.sql` (SQLite ; portable sur PostgreSQL en remplaçant la colonne générée `prix_m2`) :

| Table | Contenu |
|---|---|
| `annonces` | annonce normalisée, statut (`active`/`exclue`), motif d'exclusion, position et précision, prix initial, JSON brut |
| `prix_historique` | prix par date de collecte (baisses de prix) |
| `enrichissements` | parcelle, zone PLU, distances U/AU, Natura 2000, ZNIEFF, PPR, littoral, agglomération, route, DVF + `details_json` |
| `scores` | score total, 4 composantes, confiance, explications |
| `dvf_ventes` / `dvf_stats` | ventes de foncier non bâti retenues par commune (cache) |
| `notes` | note, statut de suivi, favori |
| `collectes` | journal : source, date, vues, nouvelles, exclues, erreur |

## 7. Tests

```bash
cd backend && python -m unittest discover -s tests -v
```

Couvrent l'extraction des montants/surfaces/références cadastrales, la typologie, chaque motif d'exclusion, la
géométrie (distance point-polygone, littoral) et les bornes du score.
