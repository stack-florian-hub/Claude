"""Historique exhaustif des adjudications Licitor par TJ ciblé, à partir des calendriers d'audiences.
Usage : python3 licitor_tj.py OUT.json [AAAA-MM-début]   (défaut 2024-01)
Respecte robots.txt (pages /ventes-judiciaires-immobilieres/ et /annonce/ autorisées), 1 requête / 1,5 s, cache disque."""
import datetime, json, os, re, sys
import licitor as L

TJ = {"nantes": "Nantes", "saint-nazaire": "Saint-Nazaire", "la-roche-sur-yon": "La Roche-sur-Yon",
      "les-sables-d-olonne": "Les Sables-d'Olonne", "angers": "Angers", "saumur": "Saumur", "tours": "Tours", "blois": "Blois"}
DEP = {"Nantes": "44", "Saint-Nazaire": "44", "La Roche-sur-Yon": "85", "Les Sables-d'Olonne": "85", "Angers": "49",
       "Saumur": "49", "Tours": "37", "Blois": "41"}
SEED = {"nantes": "vendredi-2-octobre-2026", "saint-nazaire": "vendredi-2-octobre-2026", "la-roche-sur-yon": "lundi-28-septembre-2026",
        "les-sables-d-olonne": "vendredi-3-juillet-2026", "angers": "lundi-14-septembre-2026", "saumur": "mardi-6-octobre-2026",
        "tours": "mardi-10-novembre-2026", "blois": "jeudi-15-octobre-2026"}
MOIS = {m: i + 1 for i, m in enumerate("janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre".split())}
OUT = sys.argv[1] if len(sys.argv) > 1 else "licitor_tj.json"
DEBUT = sys.argv[2] if len(sys.argv) > 2 else "2024-01"
today = datetime.date.today()

def hdate(slug):
    m = re.search(r"-(\d{1,2})-([a-z]+)-(\d{4})$", slug)
    return datetime.date(int(m.group(3)), MOIS[m.group(2)], int(m.group(1))) if m and m.group(2) in MOIS else None

def hearings(tj):
    # une page d'audience connue sert de base au calendrier mensuel (?month=&year=)
    if tj not in SEED:
        print("pas de point d'entrée pour", tj, file=sys.stderr); return []
    base = f"{L.BASE}/ventes-judiciaires-immobilieres/tj-{tj}/{SEED[tj]}.html"
    y, m = map(int, DEBUT.split("-")); found = set()
    while (y, m) <= (today.year, today.month):
        s = L.get(f"{base}?month={m}&year={y}")
        found |= set(re.findall(rf'/ventes-judiciaires-immobilieres/tj-{tj}/([a-z0-9-]+)\.html', s))
        m += 1
        if m > 12: y, m = y + 1, 1
    d0 = datetime.date(*map(int, (DEBUT + "-01").split("-")))
    return sorted((d, f"/ventes-judiciaires-immobilieres/tj-{tj}/{h}.html") for h in found if (d := hdate(h)) and d0 <= d < today)

out = {"genere": datetime.datetime.now().isoformat(timespec="minutes"), "debut": DEBUT, "resultats": [], "audiences": {}}
for tj, nom in TJ.items():
    hs = hearings(tj); out["audiences"][nom] = len(hs)
    for d, h in hs:
        s = L.get(L.BASE + h)
        for path in dict.fromkeys(re.findall(r'href="(/annonce/[^"]+\.html)"', s)):
            try:
                r = L.detail(path)
            except Exception as e:
                print("ERR", path, e, file=sys.stderr); continue
            r["dept"] = DEP[nom]; r["tribunal"] = nom; r["audience_page"] = d.isoformat()
            out["resultats"].append(r)
    print(nom, len(hs), "audiences,", len(out["resultats"]), "annonces cumulées", file=sys.stderr, flush=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
print("OK", len(out["resultats"]), file=sys.stderr)
