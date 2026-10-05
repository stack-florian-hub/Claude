# Radar Domaine

Outil de sourcing, de scoring et de suivi de biens pouvant devenir un lieu de réception de mariages (200 invités), à 45 minutes de route au plus de la gare TGV de Saint-Pierre-des-Corps.

- Artifact publié : https://claude.ai/artifact/RFLLQhy5YvSaXeqeVxLW6L (privé).
- `index.html` : la page (publiée avec `engine.js` et `geo.json`). Les données vivent dans la base `db` de l'Artifact, jamais dans la page.
- `engine.js` : moteur pur (financement, travaux, score sur 100, stratégies A à E, filtres, dédoublonnage). Même fichier pour la page et pour la tâche du lundi.
- `tests/engine.test.js` : tests unitaires (`node --test radar-domaine/tests/engine.test.js`).
- `tests/screenshot.js` : contrôle visuel local (desktop, mobile, base vide).
- `data/enrich.py` : fusion des fiches brutes, dédoublonnage, géocodage BAN, trajet Valhalla (samedi 10 h), zonage PLU (API Carto) si l'adresse est publiée.
- `data/build_geo.py` : isochrones 45 et 55 min (Valhalla) et contours communaux simplifiés (geo.api.gouv.fr).
- `data/SCHEMA.md` : format d'une fiche brute.
- `HEBDO.md` : déroulé de la mise à jour du lundi.

ARTIFACT_URL : https://claude.ai/artifact/RFLLQhy5YvSaXeqeVxLW6L

## Base de données de l'Artifact

| Chemin | Contenu |
| --- | --- |
| `biens/{id}` | Fiche dédoublonnée : faits de l'annonce, sources (URL + date), trajet, historique de prix et de scores, statut de l'annonce, compteur de contrôles en échec |
| `suivi/{id}` | Statut pipeline, notes, date de relance, checklist (écrit par la page) |
| `config/params` | Paramètres modifiés dans la page (fusionnés avec `engine.js` DEFAULTS) |
| `journal/{date}` | Une entrée par collecte : sources interrogées, blocages, différentiel, digest |
| `marche/benchmark`, `marche/financement`, `marche/dvf` | Veille marché |

Les chiffres sont indicatifs et à valider avec notaire, architecte, banque et expert-comptable.
