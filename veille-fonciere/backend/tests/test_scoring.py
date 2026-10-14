import json
import os
import unittest

from vf.geo import distance_point_geom, dist_littoral_km
from vf.models import Annonce
from vf.scoring import scorer

CFG = json.load(open(os.path.join(os.path.dirname(__file__), "..", "config.json")))


def A(**kw):
    d = dict(source="t", source_id="1", url="u", departement="85", prix=3000, surface_m2=3000, precision_geo="parcelle",
             typologie="loisir", lat=46.67, lon=-1.42)
    d.update(kw)
    return Annonce(**d)


class TestGeo(unittest.TestCase):
    def test_distance_polygone(self):
        carre = {"type": "Polygon", "coordinates": [[[-1.0, 47.0], [-0.99, 47.0], [-0.99, 47.01], [-1.0, 47.01], [-1.0, 47.0]]]}
        self.assertEqual(distance_point_geom(47.005, -0.995, carre), 0.0)
        d = distance_point_geom(47.005, -1.01, carre)    # 0,01° de longitude à 47° N ≈ 758 m
        self.assertAlmostEqual(d, 758, delta=10)

    def test_littoral(self):
        self.assertLess(dist_littoral_km(46.50, -1.78), 2)     # Les Sables
        self.assertGreater(dist_littoral_km(47.39, 0.68), 150)  # Tours


class TestScore(unittest.TestCase):
    def test_bornes_et_ordre(self):
        bon = {"dvf": {"mediane_m2": 3.0, "niveau": "commune", "n": 12}, "type_zone": "A", "zone_plu": "A",
               "dist_zone_u_m": 40, "dist_zone_au_m": None, "dist_route_m": 5, "dist_littoral_km": 8,
               "dist_agglo_km": 10, "agglo_proche": "La Roche-sur-Yon", "poids_agglo": 0.8}
        mauvais = {"dvf": {"mediane_m2": 0.5, "niveau": "commune", "n": 12}, "type_zone": "N", "zone_plu": "N",
                   "dist_zone_u_m": None, "dist_zone_au_m": None, "dist_route_m": 9999, "natura2000": 1,
                   "servitudes": ["PPR naturel (inondation, mouvement de terrain...)"], "dist_agglo_km": 60,
                   "agglo_proche": "Nantes", "poids_agglo": 1.0, "alertes": [{"code": "enclave"}]}
        s1 = scorer(A(prix=1500), bon, CFG)
        s2 = scorer(A(prix=6000), mauvais, CFG)
        for s in (s1, s2):
            self.assertTrue(0 <= s["score"] <= 100)
            self.assertLessEqual(s["s_decote"], 30)
            self.assertLessEqual(s["s_mutation"], 35)
            self.assertLessEqual(s["s_acces"], 20)
            self.assertLessEqual(s["s_rarete"], 15)
        self.assertGreater(s1["score"], 70)
        self.assertLess(s2["score"], 25)
        self.assertEqual(s1["confiance"], "haute")

    def test_precision_commune_neutre(self):
        s = scorer(A(precision_geo="commune"), {"type_zone": "U", "dist_zone_u_m": 0}, CFG)
        self.assertEqual(s["s_mutation"], round(0.3 * 35, 1))
        self.assertEqual(s["confiance"], "faible")


if __name__ == "__main__":
    unittest.main()
