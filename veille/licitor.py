"""Collecte Licitor : adjudications (24 mois) et ventes à venir, zones de Florian.
Respecte robots.txt (pages /ventes-aux-encheres-immobilieres/ et /annonce/ autorisées), 1 requête / 1,5 s."""
import re, html, json, subprocess, sys, time, datetime, os

BASE = "https://www.licitor.com"
REGIONS = ["pays-de-la-loire", "centre-val-de-loire", "poitou-charentes"]
DEPTS = {"loire-atlantique": "44", "vendee": "85", "maine-et-loire": "49", "sarthe": "72", "mayenne": "53",
         "indre-et-loire": "37", "loir-et-cher": "41", "loiret": "45", "indre": "36", "vienne": "86"}
CUTOFF = (datetime.date.today() - datetime.timedelta(days=730)).isoformat()
MOIS = {m: i + 1 for i, m in enumerate("janvier février mars avril mai juin juillet août septembre octobre novembre décembre".split())}
OUT = sys.argv[1] if len(sys.argv) > 1 else "licitor.json"
CACHE = os.path.join(os.path.dirname(OUT) or ".", "cache")
os.makedirs(CACHE, exist_ok=True)

def get(url):
    key = os.path.join(CACHE, re.sub(r"[^\w.-]", "_", url)[-180:])
    if os.path.exists(key):
        return open(key, encoding="utf-8", errors="ignore").read()
    time.sleep(1.5)
    r = subprocess.run(["curl", "-s", "-m", "30", "-A", "Mozilla/5.0 (veille encheres, usage personnel)", url], capture_output=True)
    s = r.stdout.decode("utf-8", "ignore")
    if len(s) > 1000:
        open(key, "w", encoding="utf-8").write(s)
    return s

def text(s):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    s = html.unescape(re.sub(r"<[^>]+>", "\n", s))
    return [l.strip() for l in s.splitlines() if l.strip()]

def eur(s):
    return int(re.sub(r"[^\d]", "", s)) if s and re.search(r"\d", s) else None

def date_fr(s):
    m = re.search(r"(\d{1,2})(?:er)? (\w+) (\d{4})(?: à (\d{1,2})h(\d{2})?)?", s)
    if not m or m.group(2) not in MOIS:
        return None
    d = f"{m.group(3)}-{MOIS[m.group(2)]:02d}-{int(m.group(1)):02d}"
    if m.group(4):
        d += f"T{int(m.group(4)):02d}:{m.group(5) or '00'}"
    return d

def typ(t):
    t = t.lower()
    for k, v in [("studio", "studio"), ("chambre", "studio"), ("appartement", "appartement"), ("maison", "maison"), ("pavillon", "maison"),
                 ("propriété", "maison"), ("immeuble", "immeuble"), ("local", "local"), ("commerce", "local"), ("bureau", "local"),
                 ("terrain", "terrain"), ("parcelle", "terrain")]:
        if k in t:
            return v
    return "autre"

def occ(lines):
    j = " ".join(lines).lower()
    if re.search(r"\blou[ée]e?s?\b|bail", j): return "bail"
    if re.search(r"\binoccup|\blibre\b|vacant", j): return "libre"
    if re.search(r"\boccup", j): return "occupé"
    return "inconnu"

def detail(path):
    L = text(get(BASE + path))
    d = {"lien": BASE + path, "ref": re.search(r"/(\d+)\.html", path).group(1)}
    title = next((l for l in L if re.match(r"Annonce n°\d+", l)), "")
    m = re.search(r": (.+) à (.+?) \(", title)
    d["titre"], d["commune"] = (m.group(1), m.group(2)) if m else ("", "")
    d["type"] = typ(d["titre"])
    trib = next((l for l in L if l.startswith("Tribunal")), "")
    m = re.search(r"Tribunal (?:Judiciaire|de Grande Instance|Judiciaire de Proximité) d[eu'] ?(?:la )?(.+?)\s*(?:\(|$)", trib)
    d["tribunal_brut"] = re.sub(r"\s+", " ", trib)
    d["tribunal"] = m.group(1).strip().replace("LA ROCHE", "La Roche").title().replace("Sur", "sur").replace("D'", "d'") if m else ""
    i = next((k for k, l in enumerate(L) if l.startswith("Vente aux enchères publiques")), None)
    d["date"] = date_fr(L[i + 1]) if i is not None and i + 1 < len(L) else None
    j = " ".join(L)
    m = re.search(r"Adjudication : ([\d  .]+) €", j); d["adjuge"] = eur(m.group(1)) if m else None
    maps = re.findall(r"Mise à prix : ([\d  .]+) €", j); d["map"] = eur(maps[-1]) if maps else None
    d["baisse"] = "oui" if re.search(r"baisse|abaiss", j, re.I) else "non"
    m = re.search(r"([\d  ]+(?:[,.]\d+)?) ?m²", j)
    try:
        d["surface"] = float(m.group(1).replace(" ", "").replace("\u202f", "").replace("\xa0", "").replace(",", ".")) if m else None
    except ValueError:
        d["surface"] = None
    desc_start = next((k for k, l in enumerate(L) if l.lower().startswith(("un ", "une ", "des ", "deux ", "trois ", "lot"))), None)
    desc = L[desc_start:desc_start + 6] if desc_start is not None else []
    desc = desc[:next((k for k, l in enumerate(desc) if l.startswith(("Adjudication", "Mise à prix", "(Mise"))), len(desc))]
    d["occupation"] = occ(desc)
    d["description"] = " ".join(desc)[:400]
    av = next((l for l in L if re.search(r"Ma[iî]t(r)?e |Me |SELARL|SCP", l)), "")
    d["poursuivant"] = av[:160]
    d["carence"] = "carence" in j.lower()
    v = [l for l in L if l.lower().startswith("visite")]
    d["visite_txt"] = " ".join(v)[:200]
    return d

def listing(region, hist):
    rows, p = [], 1
    while True:
        url = f"{BASE}/ventes-aux-encheres-immobilieres/{region}.html?" + ("type=H&" if hist else "") + f"p={p}"
        s = get(url)
        links = re.findall(r'href="(/annonce/[^"]+?/([a-z-]+)/(\d+)\.html)"', s)
        if not links:
            break
        dates = re.findall(r"(\d{2})-(\d{2})-(\d{4})\s*:", "\n".join(text(s)))
        if hist and dates and all(f"{y}-{m}-{d}" < CUTOFF for d, m, y in dates):
            break
        for path, dept, ref in dict.fromkeys(links):
            if dept in DEPTS:
                rows.append((path, DEPTS[dept]))
        p += 1
        if p > 150:
            break
    return rows

out = {"genere": datetime.datetime.now().isoformat(timespec="minutes"), "resultats": [], "avenir": []}
for hist, key in [(True, "resultats"), (False, "avenir")]:
    for reg in REGIONS:
        for path, dept in listing(reg, hist):
            try:
                d = detail(path)
            except Exception as e:
                print("ERR", path, e, file=sys.stderr); continue
            d["dept"] = dept
            if hist and (not d["date"] or d["date"][:10] < CUTOFF):
                continue
            out[key].append(d)
        print(key, reg, len(out[key]), file=sys.stderr, flush=True)
        json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
print("OK", len(out["resultats"]), "résultats,", len(out["avenir"]), "à venir", file=sys.stderr)
