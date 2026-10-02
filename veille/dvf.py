"""Prix au m² DVF (ventes réelles) d'une commune, pour un type de bien.
Usage : python3 dvf.py <code_insee> <Maison|Appartement|Local> [annees=2023,2024,2025]
Garde les mutations « Vente » ne contenant qu'un seul local bâti du type demandé (évite les ventes groupées)."""
import csv, io, json, subprocess, sys, statistics
from collections import defaultdict

insee, typ = sys.argv[1], sys.argv[2]
years = (sys.argv[3] if len(sys.argv) > 3 else "2023,2024,2025").split(",")
LOCAL = {"Maison": "Maison", "Appartement": "Appartement", "Local": "Local industriel. commercial ou assimilé"}[typ]

def q(a, p):
    a = sorted(a); k = (len(a) - 1) * p; f = int(k)
    return a[f] + (a[min(f + 1, len(a) - 1)] - a[f]) * (k - f)

prices = []
for y in years:
    url = f"https://files.data.gouv.fr/geo-dvf/latest/csv/{y}/communes/{insee[:2]}/{insee}.csv"
    raw = subprocess.run(["curl", "-sL", "-m", "30", url], capture_output=True).stdout.decode("utf-8", "ignore")
    if not raw.startswith("id_mutation"):
        continue
    muts = defaultdict(list)
    for r in csv.DictReader(io.StringIO(raw)):
        muts[r["id_mutation"]].append(r)
    for rows in muts.values():
        if rows[0]["nature_mutation"] != "Vente" or not rows[0]["valeur_fonciere"]:
            continue
        bati = {(r["type_local"], r["surface_reelle_bati"]) for r in rows if r["type_local"] in ("Maison", "Appartement", "Local industriel. commercial ou assimilé")}
        if len(bati) != 1:
            continue
        t, s = next(iter(bati))
        if t != LOCAL or not s or float(s) < 9:
            continue
        v = float(rows[0]["valeur_fonciere"]) / float(s)
        if 150 < v < 15000:
            prices.append((rows[0]["date_mutation"], round(v)))
vals = [p for _, p in prices]
res = {"insee": insee, "type": typ, "annees": years, "n": len(vals)}
if vals:
    res.update({"p25": round(q(vals, .25)), "mediane": round(statistics.median(vals)), "p75": round(q(vals, .75)), "derniere": max(d for d, _ in prices)})
print(json.dumps(res, ensure_ascii=False))
