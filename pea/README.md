# Radar PEA : Buy & Hold sur Euronext

Tableau de bord autonome (un seul fichier HTML) qui classe chaque matin les grandes valeurs éligibles au PEA selon un score d'opportunité d'achat, propose une allocation d'un capital de 150 000 €, suit la ligne Air Liquide (prime de fidélité, paliers 100 / 1 000 actions), estime la capacité de prêt in fine adossé au PEA et applique la grille de frais Bourse Direct.

Version publiée (artefact privé) : https://claude.ai/artifact/916Yzq1rTeLFd5AoAAknZM. Elle reflète les cours du jour de sa publication ; le script ne peut pas la republier : la page à jour chaque matin est `pea/dist/index.html` (dépôt ou GitHub Pages).

## Contenu

```
pea/
├── config/universe.json     univers suivi, fondamentaux de référence, pondérations et seuils
├── scripts/update_pea.py    script de 6h00 : données, scores, HTML, alertes (bibliothèque standard Python)
├── scripts/run_daily.sh     lanceur pour un cron local
├── web/template.html        source du tableau de bord (Tailwind, Chart.js, Lucide)
├── data/market.json         dernières données calculées (généré)
├── data/history.json        historique quotidien des scores (généré, 400 jours)
├── dist/index.html          tableau de bord autonome à ouvrir dans un navigateur (généré)
├── dist/dashboard.html      même page sans squelette HTML, pour une publication en artefact Claude
└── .env.example             variables des alertes
.github/workflows/pea-daily.yml   planification GitHub Actions
```

## Démarrage rapide

Prérequis : Python 3.9 ou plus récent. Aucune dépendance à installer.

```bash
python3 pea/scripts/update_pea.py --no-alert   # récupère les cours et régénère pea/dist/index.html
open pea/dist/index.html                        # ou xdg-open / double-clic
```

Autres options :

| Commande | Effet |
|---|---|
| `update_pea.py` | exécution complète, alertes comprises |
| `update_pea.py --paris-gate` | ne fait rien avant 6h00 (heure de Paris) ni si le run du jour existe déjà |
| `update_pea.py --build-only` | régénère le HTML depuis `data/market.json`, sans réseau (utile après modification du template) |
| `update_pea.py --no-alert` | n'envoie aucune alerte |

## Automatisation à 6h00

### Option A : GitHub Actions (recommandée)

Le workflow `.github/workflows/pea-daily.yml` tourne du mardi au samedi. GitHub planifie en UTC : il déclare 04:00 et 05:00 UTC, et `--paris-gate` ne garde que le créneau qui tombe à 6h00 à Paris, été comme hiver. Il committe ensuite `pea/data` et `pea/dist`.

1. Fusionner la branche dans la branche par défaut : GitHub n'exécute les tâches planifiées que depuis celle-ci.
2. Settings → Actions → General → Workflow permissions : « Read and write ».
3. Facultatif : ajouter les secrets d'alerte (Settings → Secrets and variables → Actions), voir plus bas.
4. Tester tout de suite : Actions → « Radar PEA - mise à jour 6h00 » → Run workflow, case `force` cochée.

GitHub peut décaler un run planifié de plusieurs minutes, parfois davantage aux heures chargées.

Pour consulter la page depuis un téléphone : activer GitHub Pages sur la branche par défaut (dépôt public, ou offre payante pour un dépôt privé) et ouvrir `…/pea/dist/`. Renseigner l'URL dans la variable `PEA_DASHBOARD_URL` pour qu'elle figure dans l'alerte.

### Option B : cron local (machine allumée à 6h00)

```bash
crontab -e
```

```
CRON_TZ=Europe/Paris
0 6 * * 2-6  /chemin/vers/Claude/pea/scripts/run_daily.sh >> /chemin/vers/Claude/pea/data/cron.log 2>&1
```

`run_daily.sh` charge `pea/.env` s'il existe. Avec `PEA_GIT_PUSH=1`, il committe et pousse les fichiers générés. Sur macOS, le Mac doit être réveillé (Réglages → Batterie → Options → réveil programmé, ou `pmset repeat wakeorpoweron TWRFS 05:58:00`). Sous Windows, le Planificateur de tâches peut lancer `python update_pea.py` à 6h00.

## Alertes du matin

Le script envoie un résumé (3 meilleures opportunités, changements de signal depuis la veille, décompte 🟢 🟡 🔴) sur chaque canal configuré :

| Canal | Variables |
|---|---|
| Discord | `DISCORD_WEBHOOK_URL` (Paramètres du salon → Intégrations → Webhooks) |
| Telegram | `TELEGRAM_BOT_TOKEN` (via @BotFather) et `TELEGRAM_CHAT_ID` |
| E-mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `ALERT_EMAIL_TO` (Gmail : mot de passe d'application) |

Le nombre de valeurs listées se règle avec `settings.alert_top_n` dans `universe.json`.

## Méthode de scoring

Chaque sous-score va de 0 à 100 (50 = neutre).

**Technique (40 % par défaut)**
- Écart à la DMA 200 : 50 − écart × 200 (−25 % sous la moyenne → 100).
- Drawdown depuis le plus haut 52 semaines : drawdown / 35 % × 100.

**Valorisation (60 % par défaut)**
- PER actuel vs PER historique (45 %) : 50 + (1 − PER/PER hist.) × 150.
- PER vs PER du secteur (25 %) : 50 + (1 − PER/PER secteur) × 100.
- Rendement sur 12 mois vs rendement historique (30 %) : 50 + (rdt/rdt hist. − 1) × 100.

**Coefficient Buy & Hold** : moyenne des notes moat, régularité du dividende et résilience (1 à 5), convertie en multiplicateur de 0,85 à 1,15.

Score = (technique × poids + valorisation × poids) × coefficient, plafonné à 100. Le classement utilise le score non plafonné pour départager les ex aequo.

**Classification**
- 🟢 Forte opportunité : score ≥ 65 et cours sous la DMA 200 ou à plus de 10 % sous son plus haut.
- 🔴 Attendre : score < 30, ou valeur « au plus haut » (drawdown ≤ 5 % et cours ≥ 8 % au-dessus de la DMA 200).
- 🟡 Accumulation : le reste.

Pondérations et seuils se règlent dans l'onglet « Univers & réglages » (mémorisés dans le navigateur) ou dans `universe.json` (utilisés par le script et les alertes). Le calcul existe en double, `compute_score()` en Python et `computeScore()` en JavaScript : toute modification doit être reportée dans les deux.

## Allocation des 150 000 €

- Valeurs retenues : 🟢 et 🟡 au-dessus du score plancher (🔴 en option).
- Poids proportionnels à (score − plancher)^1,5, plafonnés par ligne (20 % par défaut), lignes sous la taille minimale d'ordre écartées.
- Nombre d'actions entier, courtage et TTF déduits du capital, reliquat réinvesti action par action sur les meilleurs scores.
- 🟢 : un ordre immédiat. 🟡 : jusqu'à 4 tranches mensuelles d'au moins 4 400 €.
- Option Air Liquide : la ligne est complétée jusqu'au prochain palier (100 puis 1 000 actions) si cela reste dans la limite de 1,5 fois le plafond par ligne.

## Frais Bourse Direct et TTF

Grille officielle par défaut : 0,99 € jusqu'à 500 €, 1,90 € jusqu'à 1 000 €, 2,90 € jusqu'à 2 000 €, 3,80 € jusqu'à 4 400 €, puis 0,09 %. La grille simplifiée à 3 paliers est disponible, mais elle rend un ordre de 1 001 € moins cher qu'un ordre de 999 €. À partir de 4 400 €, le coût tombe à 0,09 % : c'est la taille d'ordre minimale conseillée.

TTF : 0,4 % (taux en vigueur depuis avril 2025) sur les achats d'actions françaises de plus d'un milliard d'euros de capitalisation, PEA compris. ASML en est exonérée. Taux modifiable dans l'onglet Frais.

## Nantissement et prêt in fine

Valeur de gage = valeur liquidative × quotité (55 % par défaut, réglable de 40 à 70 %). L'onglet calcule les intérêts annuels, la couverture des intérêts par les dividendes et la baisse du portefeuille tolérée avant appel de marge. Les dividendes restent dans le PEA : les intérêts se paient avec d'autres revenus. Quotité, taux et conditions d'appel de marge sont propres à chaque prêteur.

## Ajouter ou retirer une valeur

- Dans la page : onglet « Univers & réglages ». Une valeur ajoutée à la main (cours, DMA 200, plus haut, BPA…) est classée immédiatement et conservée dans ce navigateur. Les valeurs du script peuvent être masquées.
- Pour un suivi automatique : bouton « Copier » sous `universe.json`, coller dans `pea/config/universe.json`, committer. Le run suivant récupère ses cours. Le ticker est celui de Yahoo Finance (`.PA` Paris, `.AS` Amsterdam, `.BR` Bruxelles, `.MI` Milan, `.MC` Madrid, `.DE` Francfort).

## Données et limites

- Cours, plus haut et plus bas 52 semaines, DMA 200 et dividendes : endpoint `chart` de Yahoo Finance, sans clé. API non officielle : en cas d'échec, les autres valeurs sont traitées et l'erreur figure en pied de page.
- BPA 12 mois : Yahoo (endpoint `quote`, avec crumb) quand il répond, sinon `eps_ttm` de la configuration. `prefer_config_eps` force la valeur de la configuration quand le BPA IFRS est trompeur (Sanofi : BPA « business » retenu).
- PER historiques, PER sectoriels, rendements historiques et notes qualité sont des références de départ approximatives. Vérifiez-les et ajustez-les (Zonebourse, Boursorama, rapports annuels) : ils pèsent lourd dans le score.
- Calendrier des attributions gratuites Air Liquide et règles de la prime de fidélité : à confirmer sur airliquide.com (espace actionnaires).
- Outil d'aide à la décision, pas un conseil en investissement.
