# Mise à jour hebdomadaire du Radar Domaine (lundi ~6 h 47, Europe/Paris)

Artifact : https://claude.ai/artifact/RFLLQhy5YvSaXeqeVxLW6L (outil ArtifactData pour lire et écrire la base). Ne jamais republier la page. Les outils sont aussi publiés dans l'Artifact : `engine.js`, `outils/enrich.py.txt`, `outils/fix_geo.py.txt`, `outils/SCHEMA.md`, `outils/HEBDO.md`.

1. **Lire l'état** : `biens` (toutes les fiches, avec `version`), `config/params`, dernier `journal`.
2. **Collecter en parallèle** (sous-agents, un par famille) : portails et prestige ; cessions d'activité et locaux ; ventes publiques et biens publics ; segment < 650 k€ ; alertes e-mail reçues dans Gmail (recherche « annonce château / grange / domaine » des 8 derniers jours) si le connecteur répond. Format de sortie : `data/SCHEMA.md`, un fichier `data/raw_<famille>.json` et `data/log_<famille>.json` par famille. Aucune extraction contournant un blocage ; un blocage est consigné.
3. **Dédoublonner et enrichir** : `python3 data/enrich.py data/raw_*.json > data/enriched_all.json`, puis `python3 data/fix_geo.py` (relance des géocodages en échec). Rapprocher chaque fiche enrichie d'un bien existant (même URL source, sinon même commune + prix ±5 % + surface ±6 %, sinon texte proche) pour garder son `id`.
4. **Recalculer** : `engine.js` (`analyser(bien, merge(DEFAULTS, config/params))`) pour tous les biens.
5. **Différentiel** :
   - nouveau bien : `premiere_apparition` = date du jour ;
   - prix changé : ajouter à `historique_prix`, `statut_annonce` = `baisse_prix` si baisse ;
   - bien existant non retrouvé : contrôler son URL ; échec (404/410 ou annonce retirée) → `controles_echec` + 1 et `dernier_controle_echec` = date, seulement si le précédent échec date d'au moins 6 jours (deux échecs le même jour comptent pour un) ; `statut_annonce` = `retire` seulement à 2 ; succès → remettre à 0 ;
   - source qui renvoie 0 résultat alors qu'elle en renvoyait la semaine d'avant → anomalie dans le journal, aucun bien de cette source n'est touché ;
   - ajouter `{date, score, niveau}` à `historique_scores`.
6. **Écrire** (batch de 50 max, `if_version` sur chaque document existant) ; ne jamais supprimer un document.
7. **Digest** dans `journal/<date>` : top 5 des nouveautés, alertes (baisses, retraits, changements de niveau, biens > 80), 3 actions recommandées. Brouillon Gmail à florian.tue@gmail.com si le connecteur est disponible. Notification immédiate si un bien dépasse 80.
