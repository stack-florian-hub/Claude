import unittest

from vf.filters import montants, normaliser, parse_cadastre, parse_surface, qualifier, typologie
from vf.models import Annonce

CFG = {"departements": ["85", "44", "49", "37"],
       "prix": {"plancher": 300, "plafond": 10000, "plafond_par_typologie": {"constructible": 40000}, "prix_m2_max": 15},
       "surface": {"min_m2": 200, "max_m2": 500000}}


def A(prix, desc, surface=2000, titre="Terrain", dep="85"):
    return Annonce(source="t", source_id="1", url="u", departement=dep, titre=titre, description=desc, prix=prix,
                   surface_m2=surface)


class TestParse(unittest.TestCase):
    def test_montants(self):
        self.assertEqual([v for v, _ in montants(normaliser("prix réel : 80 000 €, ou 80.000€ ou 45k€"))],
                         [80000, 80000, 45000])

    def test_surface(self):
        self.assertEqual(parse_surface("Terrain de 1 ha 25 a 30 ca"), 12530)
        self.assertEqual(parse_surface("parcelle de 2 500 m²"), 2500)
        self.assertEqual(parse_surface("bois de 3,5 ha"), 35000)
        self.assertEqual(parse_surface("Vente Terrain 408 m&sup2;"), 408)

    def test_cadastre(self):
        self.assertEqual(parse_cadastre("cadastré section ZK n°123"), ("ZK", "0123"))
        self.assertEqual(parse_cadastre("Parcelle AB 45 en bordure"), ("AB", "0045"))
        self.assertIsNone(parse_cadastre("belle parcelle de 2000 m2"))

    def test_typologie(self):
        self.assertEqual(typologie("Terrain de loisir avec étang"), "etang")
        self.assertEqual(typologie("parcelle de bois taillis"), "bois")
        self.assertEqual(typologie("terrain non constructible, prairie"), "agricole")
        self.assertEqual(typologie("terrain à bâtir viabilisé"), "constructible")


class TestQualifier(unittest.TestCase):
    def test_prix_plancher(self):
        self.assertEqual(qualifier(A(1, "terrain"), CFG)[0], "prix_plancher")
        self.assertEqual(qualifier(A(299, "terrain"), CFG)[0], "prix_plancher")

    def test_prix_plafond(self):
        self.assertEqual(qualifier(A(12000, "prairie"), CFG)[0], "prix_plafond")
        self.assertIsNone(qualifier(A(12000, "terrain à bâtir viabilisé", surface=600), CFG)[0])

    def test_prix_reel_dans_texte(self):
        self.assertEqual(qualifier(A(1000, "Beau terrain. Prix réel : 80 000 €"), CFG)[0], "prix_reel_texte")
        self.assertEqual(qualifier(A(500, "Faire offre à partir de 25 000€"), CFG)[0], "prix_reel_texte")
        self.assertEqual(qualifier(A(2000, "prix d'appel, contactez-nous"), CFG)[0], "prix_reel_texte")
        # un petit montant (frais) ne déclenche rien
        self.assertIsNone(qualifier(A(5000, "Frais de notaire environ 1 500 €"), CFG)[0])

    def test_exclusions_semantiques(self):
        self.assertEqual(qualifier(A(5000, "Vente en viager occupé"), CFG)[0], "viager")
        self.assertEqual(qualifier(A(5000, "Parts de groupement forestier GFF"), CFG)[0], "gff_parts")
        self.assertEqual(qualifier(A(5000, "Vente d'une quote-part de 1/4 indivis"), CFG)[0], "indivision")
        self.assertEqual(qualifier(A(5000, "Terrain à louer 50 € par mois"), CFG)[0], "location")
        self.assertEqual(qualifier(A(5000, "Mobil-home sur emplacement de camping"), CFG)[0], "pas_un_terrain")

    def test_bail_rural_pas_exclu(self):
        motif, alertes = qualifier(A(5000, "Prairie louée, bail rural en cours"), CFG)
        self.assertIsNone(motif)
        self.assertIn("bail_rural", {x["code"] for x in alertes})

    def test_hors_zone(self):
        self.assertEqual(qualifier(A(5000, "pré", dep="22"), CFG)[0], "hors_zone")

    def test_ok(self):
        motif, alertes = qualifier(A(4500, "Terrain de loisir 3000 m² avec puits, accès direct route communale", 3000), CFG)
        self.assertIsNone(motif)
        self.assertTrue({"puits", "acces_route"} <= {x["code"] for x in alertes})


if __name__ == "__main__":
    unittest.main()


class TestHonoraires(unittest.TestCase):
    def test_cas_reels(self):
        from vf.honoraires import analyser
        self.assertEqual(analyser(6500, "", {"prixAffiche": 5000, "emoluments": 1500})["pct"], 30.0)
        h = analyser(8800, "Prix : 8 800 dont 1 800 EUR TTC d'honoraires à la charge de l'acquéreur")
        self.assertEqual((h["montant"], h["net"], h["pct"], h["charge"]), (1800, 7000, 25.7, "acquereur"))
        h = analyser(9700, "Prix honoraires inclus : 9700 euros<br>Prix hors honoraires : 7700 euros<br>Honoraires TTC à la charge de l'acquéreur (25,97% du prix du bien hors honoraires) : 2000 euros")
        self.assertEqual((h["pct"], h["net"]), (25.97, 7700))
        h = analyser(8100, "Prix Hon. Négo Inclus : 8 100 € dont 8,00% Hon. Négo TTC charge acq.")
        self.assertEqual((h["pct"], h["net"], h["charge"]), (8.0, 7500, "acquereur"))
        self.assertEqual(analyser(5900, "Honoraires d'agence à la charge du vendeur.")["charge"], "vendeur")
        self.assertIsNone(analyser(5000, "Beau terrain de loisir."))
