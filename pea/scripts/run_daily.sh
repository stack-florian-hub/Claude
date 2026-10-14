#!/usr/bin/env bash
# Lanceur pour un cron local (Linux / macOS). Exemple de crontab (crontab -e) :
#   CRON_TZ=Europe/Paris
#   0 6 * * 2-6  /chemin/vers/Claude/pea/scripts/run_daily.sh >> /chemin/vers/Claude/pea/data/cron.log 2>&1
# Les variables d'alerte (DISCORD_WEBHOOK_URL, TELEGRAM_*, SMTP_*) peuvent être placées dans pea/.env.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ -f pea/.env ]; then set -a; . pea/.env; set +a; fi
python3 pea/scripts/update_pea.py "$@"
if [ "${PEA_GIT_PUSH:-0}" = "1" ]; then
  git add pea/data pea/dist
  git diff --cached --quiet || { git commit -m "Radar PEA : données du $(date +%Y-%m-%d)"; git push; }
fi
