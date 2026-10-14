"""Collecteurs à API JSON publique : immobilier.notaires.fr (dont ventes interactives / enchères notariales) et Bien'Ici."""
import json
import logging

from ..models import Annonce
from .base import Collecteur

log = logging.getLogger("vf.collect")


class Notaires(Collecteur):
    """immobilier.notaires.fr : annonces des études notariales (vente classique, vente interactive « 36h-immo »,
    adjudications notariales). C'est aussi le canal de diffusion des ventes d'Enchères-notaires / Notaires de l'Ouest."""
    nom = "notaires"
    libelle = "Immobilier.notaires.fr"
    URL = "https://www.immobilier.notaires.fr/pub-services/inotr-www-annonces/v1/annonces"
    MODES = {"VENTE": "gre_a_gre", "VNI": "vente_interactive", "VAE": "encheres"}

    def collecter(self, dep):
        for page in range(1, self.max_pages + 1):
            d = self.http.get_json(self.URL, params={
                "page": page, "parPage": 50, "typeBiens": "TER", "typeTransactions": "VENTE,VNI,VAE",
                "departements": dep, "prixMin": self.plancher, "prixMax": self.plafond}, ttl_h=6)
            for x in d.get("annonceResumeDto", []):
                prix = x.get("prixTotal") or x.get("prixAffiche")
                yield Annonce(
                    source=self.nom, source_id=str(x["annonceId"]), url=x.get("urlDetailAnnonceFr") or "",
                    departement=x.get("inseeDepartement") or dep, titre=f"Terrain {x.get('surfaceTerrain') or ''} m² – {x.get('communeNom')}",
                    description=x.get("descriptionFr") or "", prix=prix, surface_m2=x.get("surfaceTerrain") or x.get("surface"),
                    code_insee=x.get("inseeCommune"), commune=x.get("communeNom"), code_postal=x.get("codePostal"),
                    mode_vente=self.MODES.get(x.get("typeTransaction"), "gre_a_gre"), photo_url=x.get("urlPhotoPrincipale"),
                    date_publication=(x.get("dateCreation") or "")[:10],
                    brut={k: x.get(k) for k in ("reference", "prixAffiche", "prixTotal", "emoluments", "variation",
                                                "typeTerrain", "telephone", "viager", "dateMaj")})
            if page >= (d.get("nbPages") or 1):
                break


class BienIci(Collecteur):
    """Bien'Ici : API JSON du site (annonces d'agences et de mandataires, géolocalisées avec un flou)."""
    nom = "bienici"
    libelle = "Bien'Ici"
    URL = "https://www.bienici.com/realEstateAds.json"
    ZONES = {"85": "-7402", "44": "-7432", "49": "-7409", "37": "-7408"}

    def collecter(self, dep):
        taille = 50
        for page in range(self.max_pages):
            f = {"size": taille, "from": page * taille, "filterType": "buy", "propertyType": ["terrain"],
                 "minPrice": self.plancher, "maxPrice": self.plafond, "onTheMarket": [True],
                 "sortBy": "publicationDate", "sortOrder": "desc", "zoneIdsByTypes": {"zoneIds": [self.ZONES[dep]]}}
            d = self.http.get_json(self.URL, params={"filters": json.dumps(f)}, ttl_h=6)
            ads = d.get("realEstateAds", [])
            for x in ads:
                blur = x.get("blurInfo") or {}
                pos = blur.get("position") or blur.get("centroid") or {}
                dist = x.get("district") or {}
                yield Annonce(
                    source=self.nom, source_id=x["id"], url=f"https://www.bienici.com/annonce/vente/{x['id']}",
                    departement=x.get("departmentCode") or dep, titre=(x.get("title") or "").replace("&sup2;", "²"),
                    description=x.get("description") or "", prix=x.get("price"), surface_m2=x.get("landSurfaceArea"),
                    code_insee=dist.get("code_insee") or dist.get("insee_code"), commune=x.get("city"),
                    code_postal=x.get("postalCode"), lat=pos.get("lat"), lon=pos.get("lon"),
                    photo_url=((x.get("photos") or [{}])[0]).get("url"), date_publication=(x.get("publicationDate") or "")[:10],
                    brut={"rayon_flou_m": blur.get("radius") if blur.get("type") == "disk" else 0,
                          "reference": x.get("reference"), "accountType": x.get("accountType"),
                          "priceHasDecreased": x.get("priceHasDecreased")})
            if (page + 1) * taille >= d.get("total", 0) or not ads:
                break
