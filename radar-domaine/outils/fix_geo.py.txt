import json, re, sys
PATH = sys.argv[1] if len(sys.argv) > 1 else 'enriched_all.json'
sys.argv = ['x']
import enrich as E
d = json.load(open(PATH))
for b in d['biens']:
    c = b.get('commune') or ''
    m = re.match(r'^\s*secteur\s+(.+)$', c, re.I)
    if (not b.get('lat') or not b.get('trajets')) and (m or not re.search(r'proche|portes|sud|nord|confins|non publi|indre-et-loire', c, re.I)):
        orig = c
        if m: b['commune'] = m.group(1)
        E.geocode(b); E.route(b)
        if b.get('lat') and not b.get('departement') and b.get('code_insee'): b['departement'] = str(b['code_insee'])[:2]
        if m:
            b['commune'] = orig
            if b.get('lat'): b['precision_gps'] = 'secteur'
        if b.get('lat'):
            b['dist_gare_km'] = round(E.hav(E.GARE, (b['lat'], b['lon'])), 1)
            b['a_verifier'] = [x for x in b['a_verifier'] if x != 'localisation']
        print(c, b.get('lat'), b.get('trajet_min'))
d['log'] += E.LOG
json.dump(d, open(PATH, 'w'), ensure_ascii=False, indent=1)
