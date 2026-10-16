#!/usr/bin/env bash
# Mise à jour quotidienne : nouvelles annonces, annonces vendues/retirées, enrichissement, score, export, page.
# Lancée chaque matin par la routine claude.ai ; utilisable aussi à la main.
set -euo pipefail
ICI="$(cd "$(dirname "$0")" && pwd)"
cd "$ICI/backend"
python3 -m pip install -q -r requirements.txt >/dev/null 2>&1 || true
python3 -m vf tout -s notaires,bienici,paruvendu 2>&1 | tee -a data/quotidien.log | grep -vE "vf.http|enrichi [0-9]" || true
python3 "$ICI/artifact/build_artifact.py"
python3 - <<'PY'
import json
d = json.load(open("../frontend/public/data/opportunites.json"))
j = (d.get("journal") or [{}])[0]
print(f"RÉSUMÉ {d['genere_le'][:10]} : {len(d['annonces'])} terrains en vente ; "
      f"dernier jour du journal {j.get('date')} : {len(j.get('nouvelles', []))} nouveaux, {len(j.get('vendues', []))} vendus/retirés")
PY
