"""Ajoute departement et trajets {spdc, romorantin} aux biens existants (lecture d'un export ArtifactData)."""
import json, os, sys, time, re, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enrich as E
src, out = sys.argv[1], sys.argv[2]
deps = [f for f in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deps.json')))['features']]
def pip(lon, lat, poly):
    c = False; n = len(poly); j = n - 1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi: c = not c
        j = i
    return c
def dept_point(lon, lat):
    for f in deps:
        g = f['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        if any(pip(lon, lat, p[0]) for p in polys): return f['properties']['code']
    return None
POLES = {'romorantin': (47.3586, 1.7414)}
def route(lat, lon, pole):
    body = {'locations': [{'lat': pole[0], 'lon': pole[1]}, {'lat': lat, 'lon': lon}], 'costing': 'auto', 'date_time': {'type': 1, 'value': '2026-10-10T10:00'}, 'units': 'kilometers', 'directions_type': 'none'}
    r = E.get('https://valhalla1.openstreetmap.de/route?json=' + urllib.parse.quote(json.dumps(body))); time.sleep(1.1)
    return round(r['trip']['summary']['time'] / 60) if r and 'trip' in r else None
writes = []
for fn in sorted(os.listdir(src)):
    d = json.load(open(os.path.join(src, fn))); v = d.get('version'); b = d.get('data', d)
    patch = {}
    dep = (b.get('code_insee') or b.get('code_postal') or '')[:2] or None
    how = 'code'
    if not dep and b.get('lat') and b.get('lon'): dep = dept_point(b['lon'], b['lat']); how = 'gps'
    if not dep:
        txt = ' '.join(str(b.get(k) or '') for k in ('commune', 'titre', 'description'))
        if re.search(r'Indre-et-Loire|Tours|Touraine|Amboise|Loches|Vouvray|Chinon', txt) and not re.search(r'Anjou', txt): dep, how = '37', 'texte'
    if dep:
        patch['departement'] = dep
        if how == 'texte': patch['a_verifier'] = sorted(set((b.get('a_verifier') or []) + ['département (déduit du texte de l’annonce)']))
    tr = dict(b.get('trajets') or {})
    if b.get('trajet_min') is not None and 'spdc' not in tr: tr['spdc'] = b['trajet_min']
    if b.get('lat') and b.get('lon') and 'romorantin' not in tr:
        m = route(b['lat'], b['lon'], POLES['romorantin'])
        if m is not None: tr['romorantin'] = m
    if tr and tr != b.get('trajets'): patch['trajets'] = tr
    if patch:
        writes.append({'op': 'update', 'collection': 'biens', 'doc_id': fn[:-5], 'if_version': v, 'data': patch})
    print(fn[:-5][:40].ljust(40), dep, how, tr)
for i in range(0, len(writes), 50):
    json.dump(writes[i:i+50], open(f'{out}_{i//50}.json', 'w'), ensure_ascii=False)
print(len(writes), E.LOG)
