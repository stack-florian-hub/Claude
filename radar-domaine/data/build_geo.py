"""Fond de carte du Radar Domaine : contours communaux des départements suivis (37, 41, 44, 85),
contours des départements voisins, isochrones 45/55 min (Saint-Pierre-des-Corps) et 45 min (Romorantin), Valhalla."""
import json, math
def dp(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; ax, ay = a; bx, by = b; dx, dy = bx-ax, by-ay; L = math.hypot(dx, dy) or 1e-12
    dmax, idx = 0, 0
    for i in range(1, len(pts)-1):
        px, py = pts[i]; d = abs(dy*px - dx*py + bx*ay - by*ax) / L
        if d > dmax: dmax, idx = d, i
    if dmax > tol: return dp(pts[:idx+1], tol)[:-1] + dp(pts[idx:], tol)
    return [a, b]
_dp = dp
def dp(pts, tol):
    # anneau fermé : on le coupe en deux pour que l'algorithme ne s'effondre pas sur une corde nulle
    if len(pts) > 3 and pts[0] == pts[-1]:
        m = len(pts) // 2
        return _dp(pts[:m + 1], tol)[:-1] + _dp(pts[m:], tol)
    return _dp(pts, tol)
SUIVIS = ['37', '41', '44', '85']
coms = []; cent = {}
for d in SUIVIS:
    for f in json.load(open(f'com_{d}.json'))['features']:
        g = f['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        ring = max((p[0] for p in polys), key=len)
        xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
        s = dp(ring, 0.003)
        if len(s) < 4: s = ring[::max(1, len(ring)//6)]
        coms.append({'n': f['properties']['nom'], 'c': f['properties']['code'], 'd': d, 'r': [[round(x, 3), round(y, 3)] for x, y in s]})
        cent[f['properties']['code']] = [f['properties']['nom'], round(sum(xs)/len(xs), 4), round(sum(ys)/len(ys), 4)]
deps = []
for f in json.load(open('deps.json'))['features']:
    c = f['properties']['code']
    g = f['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    rings = [[[round(x, 3), round(y, 3)] for x, y in dp(p[0], 0.004)] for p in polys if len(p[0]) > 20]
    xs = [x for r in rings for x, y in r]; ys = [y for r in rings for x, y in r]
    if not xs or max(xs) < -3 or min(xs) > 3 or max(ys) < 45.6 or min(ys) > 48.6: continue
    deps.append({'c': c, 'n': f['properties']['nom'], 'suivi': c in SUIVIS, 'rings': rings,
                 'bbox': [min(xs), min(ys), max(xs), max(ys)]})
iso = {}
for f in json.load(open('iso.json'))['features']:
    iso['spdc_' + str(int(f['properties']['contour']))] = [[round(x, 4), round(y, 4)] for x, y in dp(f['geometry']['coordinates'][0], 0.002)]
for f in json.load(open('iso_romo.json'))['features']:
    iso['romorantin_' + str(int(f['properties']['contour']))] = [[round(x, 4), round(y, 4)] for x, y in dp(f['geometry']['coordinates'][0], 0.002)]
out = {'gare': {'nom': 'Gare de Saint-Pierre-des-Corps', 'lat': 47.38575, 'lon': 0.72330},
       'poles': [{'id': 'spdc', 'nom': 'Gare TGV Saint-Pierre-des-Corps', 'lat': 47.38575, 'lon': 0.72330},
                 {'id': 'romorantin', 'nom': 'Romorantin-Lanthenay', 'lat': 47.3586, 'lon': 1.7414},
                 {'id': 'nantes', 'nom': 'Gare de Nantes', 'lat': 47.2173, 'lon': -1.5420},
                 {'id': 'laroche', 'nom': 'Gare de La Roche-sur-Yon', 'lat': 46.6705, 'lon': -1.4206}],
       'isochrones': iso, 'isochrone_meta': {'moteur': 'Valhalla (valhalla1.openstreetmap.de, données OSM)', 'depart': 'samedi 10:00', 'calcule_le': '2026-10-09'},
       'departements': deps, 'communes': coms}
json.dump(out, open('geo.json', 'w'), separators=(',', ':'))
json.dump(cent, open('centroides.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(coms), len(deps), list(iso))
