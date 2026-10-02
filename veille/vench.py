"""Ventes à venir publiées sur vench.fr (liste publique par tribunal ; le détail est réservé aux abonnés et n'est pas lu).
Usage : python3 vench.py OUT.json"""
import html, json, re, subprocess, sys, time

TRIBS = {"nantes": "Nantes", "la-roche-sur-yon": "La Roche-sur-Yon", "les-sables-d-olonne": "Les Sables-d'Olonne", "angers": "Angers",
         "saumur": "Saumur", "tours": "Tours", "blois": "Blois", "le-mans": "Le Mans", "laval": "Laval", "poitiers": "Poitiers",
         "orleans": "Orléans", "chateauroux": "Châteauroux"}

def get(url):
    time.sleep(1.5)
    return subprocess.run(["curl", "-s", "-m", "30", "-A", "Mozilla/5.0 (veille encheres, usage personnel)", url], capture_output=True).stdout.decode("utf-8", "ignore")

def typ(t):
    t = t.lower()
    for k, v in [("studio", "studio"), ("appartement", "appartement"), ("maison", "maison"), ("immeuble", "immeuble"), ("local", "local"),
                 ("commerc", "local"), ("terrain", "terrain"), ("parcelle", "terrain")]:
        if k in t:
            return v
    return "autre"

out = []
for slug, trib in TRIBS.items():
    s = get(f"https://www.vench.fr/liste-des-ventes-au-tribunal-judiciaire-{slug}.html")
    ids = list(dict.fromkeys(re.findall(r'href="\./(vente-(\d+)-[^"]+\.html)"', s)))
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    L = [l.strip() for l in html.unescape(re.sub(r"<[^>]+>", "\n", t)).splitlines() if len(l.strip()) > 2]
    starts = [i for i, l in enumerate(L) if " • " in l]
    for n, i in enumerate(starts):
        block = L[i:starts[n + 1] if n + 1 < len(starts) else i + 12]
        parts = [p.strip() for p in block[0].split(" • ")]
        j = " ".join(block)
        m = re.search(r"Mise à prix\s*:\s*([\d\s]+)(?:\.\d\d)?\s*€", j)
        dv = re.search(r"Date de la vente\s*:\s*(\d\d)/(\d\d)/(\d\d)", j)
        vi = re.search(r"Prochaine visite\s*:\s*(\d\d/\d\d/\d{4})", j)
        sm = next((p for p in parts if p.endswith("m²")), None)
        e = {"titre": parts[0].capitalize(), "commune": parts[-1], "type": typ(parts[0]), "tribunal": trib,
             "map": int(re.sub(r"[^\d]", "", m.group(1))) if m else None,
             "audience": f"20{dv.group(3)}-{dv.group(2)}-{dv.group(1)}" if dv else None,
             "visite": "-".join(reversed(vi.group(1).split("/"))) if vi else None,
             "surface": float(sm[:-2].replace(",", ".")) if sm else None}
        if n < len(ids):
            e["ref"] = "vench-" + ids[n][1]
            e["lien"] = "https://www.vench.fr/" + ids[n][0]
        out.append(e)
    print(trib, len(starts), file=sys.stderr)
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
