"""Centre approximatif d'une commune (centroïde du contour), pour la carte de la tour de contrôle.
Source : contours communaux france-geojson (gregoiredavid, GitHub), mis en cache dans veille/cache/geo.
Précision : la commune, pas l'adresse (api-adresse est bloqué dans l'environnement)."""
import json, os, re, unicodedata, urllib.request

DOSSIERS = {"36": "36-indre", "37": "37-indre-et-loire", "41": "41-loir-et-cher", "44": "44-loire-atlantique",
            "45": "45-loiret", "49": "49-maine-et-loire", "53": "53-mayenne", "72": "72-sarthe",
            "79": "79-deux-sevres", "85": "85-vendee", "86": "86-vienne", "17": "17-charente-maritime"}
TRIB_DEPT = {"Nantes": "44", "Saint-Nazaire": "44", "La Roche-sur-Yon": "85", "Les Sables-d'Olonne": "85", "Angers": "49",
             "Saumur": "49", "Tours": "37", "Blois": "41", "Le Mans": "72", "Laval": "53", "Orléans": "45", "Montargis": "45",
             "Châteauroux": "36", "Poitiers": "86", "Niort": "79", "La Rochelle": "17", "Saintes": "17"}
# Communes déléguées absentes du jeu (communes nouvelles)
ALIAS = {"contigne": "hauts d anjou"}
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", "geo")
_idx = {}

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", " ", s.replace("saint", "st")).strip()
    s = re.sub(r"^(le|la|les|l) ", "", s)  # le jeu de contours omet l'article initial
    return ALIAS.get(s, s)

def _centroid(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    A = X = Y = 0.0
    for poly in polys:
        r = poly[0]
        for (x0, y0), (x1, y1) in zip(r, r[1:]):
            c = x0 * y1 - x1 * y0
            A += c; X += (x0 + x1) * c; Y += (y0 + y1) * c
    if not A:
        x, y = polys[0][0][0]
        return round(y, 5), round(x, 5)
    return round(Y / (3 * A), 5), round(X / (3 * A), 5)

def _load(dept):
    if dept in _idx or dept not in DOSSIERS:
        return _idx.get(dept, {})
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, dept + ".geojson")
    if not os.path.exists(p):
        d = DOSSIERS[dept]
        url = f"https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements/{d}/communes-{d}.geojson"
        urllib.request.urlretrieve(url, p)
    fc = json.load(open(p, encoding="utf-8"))
    _idx[dept] = {norm(f["properties"]["nom"]): _centroid(f["geometry"]) for f in fc["features"]}
    return _idx[dept]

def centre(commune, dept=None, tribunal=None):
    """commune peut contenir '(85)'. Renvoie (lat, lon) ou None."""
    m = re.search(r"\((\d{2})\)", commune or "")
    dept = dept or (m and m.group(1)) or TRIB_DEPT.get(tribunal or "")
    nom = norm(re.sub(r"\s*\(.*", "", commune or ""))
    for d in [dept] + [k for k in DOSSIERS if k != dept]:
        if not d:
            continue
        try:
            hit = _load(d).get(nom)
        except Exception:
            continue
        if hit:
            return hit
    return None

if __name__ == "__main__":
    import sys
    print(centre(*sys.argv[1:]))
