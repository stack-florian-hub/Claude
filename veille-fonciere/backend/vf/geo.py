"""Géométrie légère (sans dépendance GIS) : distances en mètres autour d'un point, en projection locale.

Précision : < 0,5 % d'erreur sur quelques kilomètres, largement suffisant pour mesurer « à 120 m d'une zone U ».
"""
import math

R = 6371008.8

# Agglomérations de référence (lat, lon, poids : 1 = métropole, 0,7 = pôle secondaire)
AGGLOS = {
    "Nantes": (47.2184, -1.5536, 1.0),
    "Angers": (47.4784, -0.5632, 1.0),
    "Tours": (47.3941, 0.6848, 1.0),
    "Saint-Nazaire": (47.2735, -2.2138, 0.8),
    "La Roche-sur-Yon": (46.6705, -1.4260, 0.8),
    "Cholet": (47.0600, -0.8790, 0.7),
    "Les Sables-d'Olonne": (46.4969, -1.7831, 0.8),
    "Saumur": (47.2600, -0.0769, 0.6),
    "Ancenis": (47.3656, -1.1770, 0.6),
    "Amboise": (47.4123, 0.9827, 0.6),
    "Challans": (46.8467, -1.8781, 0.6),
    "Montaigu": (46.9731, -1.3092, 0.6),
}

# Trait de côte simplifié Vendée / Loire-Atlantique (sud -> nord), îles comprises
LITTORAL = [
    [(46.318, -1.300), (46.343, -1.430), (46.400, -1.520), (46.413, -1.590), (46.470, -1.740), (46.495, -1.795),
     (46.560, -1.840), (46.620, -1.870), (46.690, -1.950), (46.760, -2.040), (46.800, -2.090), (46.835, -2.140),
     (46.890, -2.150), (46.940, -2.090), (46.975, -2.030), (47.030, -2.000), (47.065, -2.000), (47.110, -2.100),
     (47.140, -2.200), (47.170, -2.230), (47.240, -2.170), (47.270, -2.200), (47.260, -2.340), (47.280, -2.400),
     (47.270, -2.470), (47.290, -2.520), (47.340, -2.540), (47.380, -2.540), (47.430, -2.480)],
    [(46.940, -2.230), (47.000, -2.250), (47.040, -2.300), (47.010, -2.200), (46.940, -2.230)],   # Noirmoutier
    [(46.690, -2.290), (46.715, -2.390), (46.740, -2.350), (46.700, -2.280), (46.690, -2.290)],   # Yeu
]


def haversine_m(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


class Projection:
    """Projection équirectangulaire centrée sur un point : (lon, lat) -> (x, y) en mètres."""

    def __init__(self, lat, lon):
        self.lat0, self.lon0 = lat, lon
        self.kx = math.cos(math.radians(lat)) * math.pi * R / 180
        self.ky = math.pi * R / 180

    def __call__(self, lon, lat):
        return (lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky


def _dist_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def _dans_anneau(x, y, ring):
    dedans = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-30) + xi:
            dedans = not dedans
        j = i
    return dedans


def polygones(geom):
    """GeoJSON Polygon/MultiPolygon -> liste de polygones (liste d'anneaux de (lon, lat))."""
    if not geom:
        return []
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def lignes(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def distance_point_geom(lat, lon, geom):
    """Distance (m) du point à une géométrie GeoJSON ; 0 si le point est dans le polygone."""
    proj = Projection(lat, lon)
    best = math.inf
    for poly in polygones(geom):
        rings = [[proj(*c[:2]) for c in ring] for ring in poly]
        if rings and _dans_anneau(0, 0, rings[0]) and not any(_dans_anneau(0, 0, h) for h in rings[1:]):
            return 0.0
        for ring in rings:
            for a, b in zip(ring, ring[1:]):
                best = min(best, _dist_segment(0, 0, *a, *b))
    if geom["type"] in ("LineString", "MultiLineString"):
        for line in lignes(geom):
            pts = [proj(*c[:2]) for c in line]
            for a, b in zip(pts, pts[1:]):
                best = min(best, _dist_segment(0, 0, *a, *b))
    if geom["type"] == "Point":
        best = haversine_m(lat, lon, geom["coordinates"][1], geom["coordinates"][0])
    return best


def centroide(geom):
    """Centroïde (lat, lon) du plus grand polygone, ou None."""
    best, best_a = None, 0
    for poly in polygones(geom):
        ring = poly[0]
        a = cx = cy = 0.0
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            c = x0 * y1 - x1 * y0
            a += c
            cx += (x0 + x1) * c
            cy += (y0 + y1) * c
        if abs(a) > best_a:
            best_a = abs(a)
            best = (cy / (3 * a), cx / (3 * a)) if a else (ring[0][1], ring[0][0])
    return best


def bbox_autour(lat, lon, rayon_m):
    dlat = rayon_m / 111_320
    dlon = rayon_m / (111_320 * math.cos(math.radians(lat)))
    return lat - dlat, lon - dlon, lat + dlat, lon + dlon


def carre_geojson(lat, lon, rayon_m):
    s, w, n, e = bbox_autour(lat, lon, rayon_m)
    return {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}


def dist_littoral_km(lat, lon):
    proj = Projection(lat, lon)
    best = math.inf
    for line in LITTORAL:
        pts = [proj(lo, la) for la, lo in line]
        for a, b in zip(pts, pts[1:]):
            best = min(best, _dist_segment(0, 0, *a, *b))
    return best / 1000


def agglo_proche(lat, lon):
    """(nom, distance km, poids) de l'agglomération qui maximise poids / distance."""
    best = None
    for nom, (la, lo, w) in AGGLOS.items():
        d = haversine_m(lat, lon, la, lo) / 1000
        cle = d / w
        if best is None or cle < best[3]:
            best = (nom, d, w, cle)
    return best[:3]
