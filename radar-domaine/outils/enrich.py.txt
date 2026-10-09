"""Enrichissement des fiches brutes : fusion, dédoublonnage, géocodage (BAN),
temps de trajet réel (Valhalla, samedi 10 h), distance gare, échangeur autoroutier
le plus proche (OSM), zonage PLU si adresse précise (API Carto GPU).
Usage : python3 enrich.py raw_a.json raw_b.json ... > enriched.json
Toutes les requêtes passent par le proxy de l'environnement (urllib lit HTTPS_PROXY)."""
import hashlib, json, math, os, re, sys, time, unicodedata, urllib.parse, urllib.request

GARE = (47.38575, 0.72330)
# Pôles de référence (gares) : le trajet est calculé depuis chaque pôle à moins de 150 km à vol d'oiseau
POLES = {'spdc': GARE, 'romorantin': (47.3586, 1.7414), 'nantes': (47.2173, -1.5420), 'laroche': (46.6705, -1.4206)}
TODAY = time.strftime('%Y-%m-%d')
HERE = os.path.dirname(os.path.abspath(__file__))
LOG = []


def get(url, data=None, timeout=40):
    for i in range(3):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': 'RadarDomaine/1.0 (usage personnel)'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:  # noqa
            err = e
            time.sleep(2 * (i + 1))
    LOG.append(f'{url[:80]} : {err}')
    return None


def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9 ]', ' ', s)


def words(s):
    return {w for w in norm(s).split() if len(w) > 3}


def jaccard(a, b):
    return len(a & b) / len(a | b) if a | b else 0


def same(x, y):
    cx, cy = norm(x.get('commune')).strip(), norm(y.get('commune')).strip()
    if not cx or cx != cy:
        return False
    px, py, sx, sy = x.get('prix'), y.get('prix'), x.get('surface_bati_m2'), y.get('surface_bati_m2')
    pp = bool(px and py and abs(px - py) / max(px, py) <= 0.05)
    sp = bool(sx and sy and abs(sx - sy) / max(sx, sy) <= 0.06)
    t = jaccard(words(x.get('titre', '') + ' ' + (x.get('description') or '')), words(y.get('titre', '') + ' ' + (y.get('description') or '')))
    return (pp and sp) or ((pp or sp) and t > 0.25) or t > 0.55


def dedupe(items):
    out = []
    for b in items:
        d = next((o for o in out if same(o, b)), None)
        if d:
            for s in b.get('sources', []):
                if all(s['url'] != t['url'] for t in d['sources']):
                    d['sources'].append(s)
            for k, v in b.items():
                if d.get(k) in (None, [], '') and v not in (None, [], ''):
                    d[k] = v
            d['verifie'] = d.get('verifie') or b.get('verifie')
        else:
            out.append(json.loads(json.dumps(b)))
    return out


def hav(a, b):
    R = 6371
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def geocode(b):
    if b.get('lat') and b.get('lon'):
        b.setdefault('precision_gps', 'commune')
        return
    commune = (b.get('commune') or '').split('(')[0].split('/')[0].strip()
    if not commune or re.search(r'proche|portes|secteur|sud|nord|confins|non publi', commune, re.I):
        b['precision_gps'] = None
        return
    adresse = b.get('adresse')
    q = f"{adresse} {commune}" if adresse else commune
    url = 'https://api-adresse.data.gouv.fr/search/?' + urllib.parse.urlencode({'q': q, 'limit': 1, **({} if adresse else {'type': 'municipality'})})
    r = get(url)
    if not r or not r.get('features'):
        return
    f = r['features'][0]
    p = f['properties']
    if p.get('score', 0) < 0.6 or str(p.get('citycode', ''))[:2] not in ('37', '41', '44', '85', '72', '49', '36', '86', '18', '45', '79', '17', '35', '56', '53'):
        LOG.append(f"géocodage douteux pour {q} : {p.get('label')}")
        return
    b['lon'], b['lat'] = f['geometry']['coordinates']
    b['precision_gps'] = 'adresse' if adresse and p.get('type') in ('housenumber', 'street') else 'commune'
    b['code_insee'] = p.get('citycode')
    b.setdefault('code_postal', p.get('postcode'))


def route(b):
    if not (b.get('lat') and b.get('lon')):
        return
    trajets = dict(b.get('trajets') or {})
    for pole, (plat, plon) in POLES.items():
        if pole in trajets or hav((plat, plon), (b['lat'], b['lon'])) > 150:
            continue
        body = {'locations': [{'lat': plat, 'lon': plon}, {'lat': b['lat'], 'lon': b['lon']}], 'costing': 'auto',
                'date_time': {'type': 1, 'value': '2026-10-10T10:00'}, 'units': 'kilometers', 'directions_type': 'none'}
        r = get('https://valhalla1.openstreetmap.de/route?json=' + urllib.parse.quote(json.dumps(body)))
        time.sleep(1.1)  # serveur public : une requête par seconde
        if r and 'trip' in r:
            s = r['trip']['summary']
            trajets[pole] = round(s['time'] / 60)
            if pole == 'spdc':
                b['trajet_min'] = trajets[pole]
                b['distance_route_km'] = round(s['length'], 1)
    if trajets:
        b['trajets'] = trajets
        b['trajet_source'] = 'Valhalla OSM, samedi 10 h' + (', centre de la commune' if b.get('precision_gps') != 'adresse' else '')


JUNCTIONS = []
try:
    J = json.load(open(os.path.join(HERE, 'junctions.json')))
    for e in J.get('elements', []):
        t = e.get('tags', {})
        JUNCTIONS.append((e['lat'], e['lon'], (t.get('ref') and 'sortie ' + t['ref'] + ' ' or '') + (t.get('name') or '')))
except Exception:  # noqa
    pass


def autoroute(b):
    if not (b.get('lat') and JUNCTIONS):
        return
    best = min(JUNCTIONS, key=lambda j: hav((b['lat'], b['lon']), (j[0], j[1])))
    b['acces_autoroute'] = f"{best[2].strip() or 'échangeur'} à {hav((b['lat'], b['lon']), best[:2]):.0f} km à vol d'oiseau"


def plu(b):
    if b.get('precision_gps') != 'adresse':
        return
    g = json.dumps({'type': 'Point', 'coordinates': [b['lon'], b['lat']]})
    r = get('https://apicarto.ign.fr/api/gpu/zone-urba?geom=' + urllib.parse.quote(g))
    if r and r.get('features'):
        p = r['features'][0]['properties']
        b['plu'] = {'zone': p.get('libelle'), 'libelle': p.get('libelong'), 'source': "API Carto IGN, Géoportail de l'Urbanisme", 'date': TODAY}


def ident(b):
    base = norm(b.get('commune') or 'zone').split()
    slug = '-'.join(base[:3])[:24] or 'zone'
    h = hashlib.sha1(b['sources'][0]['url'].encode()).hexdigest()[:6]
    return f"{b.get('type', 'bien')}-{slug}-{h}".replace('_', '-')


def main(paths):
    items = []
    for p in paths:
        try:
            items += json.load(open(p))
        except Exception as e:  # noqa
            LOG.append(f'{p} illisible : {e}')
    items = [b for b in items if b.get('sources')]
    out = dedupe(items)
    for b in out:
        geocode(b)
        route(b)
        autoroute(b)
        plu(b)
        if b.get('lat'):
            b['dist_gare_km'] = round(hav(GARE, (b['lat'], b['lon'])), 1)
        if not b.get('departement'):
            c = b.get('code_insee') or b.get('code_postal')
            if c: b['departement'] = str(c)[:2]
        b['id'] = ident(b)
        b.setdefault('premiere_apparition', TODAY)
        b['derniere_vue'] = TODAY
        b.setdefault('statut_annonce', 'active')
        b.setdefault('controles_echec', 0)
        if b.get('prix') and not b.get('historique_prix'):
            b['historique_prix'] = [{'date': TODAY, 'prix': b['prix']}]
        b['a_verifier'] = sorted(set(b.get('a_verifier') or []) | ({'localisation'} if not b.get('lat') else set()))
    json.dump({'biens': out, 'log': LOG, 'nb_bruts': len(items)}, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main(sys.argv[1:])
