"""Collecteurs HTML par site. Chaque classe ne déclare que ses URL de recherche et le motif de ses liens d'annonces ;
l'extraction est commune (base.extraire_detail). Les URL sont surchargeables dans config.json > recherches.

Sites à rendu JavaScript et protection anti-robot (LeBonCoin, SeLoger, Logic-Immo) : rendu via Playwright en
fenêtre visible. Aucune protection n'est contournée : si une vérification humaine apparaît, vous la faites
vous-même ; sinon la source est ignorée pour ce passage.
"""
import json
import logging
import re

from bs4 import BeautifulSoup

from ..filters import parse_surface
from ..http import Bloque
from ..models import Annonce
from .base import DEP_NOMS, CollecteurHtml

log = logging.getLogger("vf.collect")


class ParuVendu(CollecteurHtml):
    nom, libelle = "paruvendu", "ParuVendu"
    motif_lien = r"^/immobilier/vente/terrain/\d{6,}[A-Z0-9]+$"

    def urls_recherche(self, dep):
        return [f"https://www.paruvendu.fr/immobilier/vente/terrain/{DEP_NOMS[dep]}-{dep}/?px1={self.plafond}&p={p}"
                for p in range(1, 4)]


class GreenAcres(CollecteurHtml):
    nom, libelle = "greenacres", "Green-Acres"
    motif_lien = r"green-acres\.fr/(fr/)?(terrain|land|properties)/[^\"]*\d{5,}|/fr/properties/\d+\.htm"
    besoin_js = True
    selecteur_attente = "a[href*='properties']"

    def urls_recherche(self, dep):
        return [f"https://www.green-acres.fr/fr/prog_show_properties.html?searchQuery=lg-fr-cn-fr-t-terrain-r-{dep}-pmax-{self.plafond}"]


class ProprietesRurales(CollecteurHtml):
    """Proprietes-rurales.com (annonces rurales, dont rétrocessions SAFER relayées par les agences)."""
    nom, libelle = "proprietes_rurales", "Proprietes-rurales.com"
    motif_lien = r"proprietes-rurales\.com/[^\"]*(annonce|vente)[^\"]*\d{4,}"
    besoin_js = True

    def urls_recherche(self, dep):
        n = DEP_NOMS[dep]
        return [f"https://www.proprietes-rurales.com/vente-terrain-de-loisir,{n},{dep}.html",
                f"https://www.proprietes-rurales.com/vente-bois-et-forets,{n},{dep}.html",
                f"https://www.proprietes-rurales.com/vente-terrain-agricole,{n},{dep}.html"]


class Figaro(CollecteurHtml):
    nom, libelle = "figaro", "Figaro Immobilier"
    motif_lien = r"immobilier\.lefigaro\.fr/annonces/annonce-\d+\.html"
    besoin_js = True

    def urls_recherche(self, dep):
        return [f"https://immobilier.lefigaro.fr/annonces/immobilier-vente-terrain-{DEP_NOMS[dep]}.html?priceMax={self.plafond}"]


class Agorastore(CollecteurHtml):
    """Agorastore (ventes aux enchères de biens publics : communes, départements). Vencheres.com renvoie au même réseau."""
    nom, libelle = "agorastore", "Agorastore"
    motif_lien = r"agorastore\.fr/[^\"]*(terrain|immobilier)[^\"]*\d{4,}"
    besoin_js = True

    def urls_recherche(self, dep):
        return [f"https://www.agorastore.fr/recherche?category=immobilier&q=terrain%20{dep}"]


class SeLoger(CollecteurHtml):
    nom, libelle = "seloger", "SeLoger"
    motif_lien = r"seloger\.com/annonces/achat/terrain/[^\"]+\.htm"
    besoin_js = True
    selecteur_attente = "a[href*='/annonces/achat/terrain/']"

    def urls_recherche(self, dep):
        return [f"https://www.seloger.com/list.htm?projects=2&types=4&places=[{{%22divisions%22:[{dep}]}}]&price=NaN/{self.plafond}"]


class LogicImmo(CollecteurHtml):
    nom, libelle = "logicimmo", "Logic-Immo"
    motif_lien = r"logic-immo\.com/detail-vente-[^\"]+\.htm"
    besoin_js = True

    def urls_recherche(self, dep):
        return [f"https://www.logic-immo.com/vente-immobilier-{DEP_NOMS[dep]},{dep}_99/options/groupprptypesids=3/pricemax={self.plafond}"]


class LeBonCoin(CollecteurHtml):
    """LeBonCoin : la page de résultats embarque les annonces en JSON (__NEXT_DATA__) ; pas besoin d'ouvrir chaque annonce."""
    nom, libelle = "leboncoin", "LeBonCoin"
    besoin_js = True
    selecteur_attente = "script#__NEXT_DATA__"

    def urls_recherche(self, dep):
        return [f"https://www.leboncoin.fr/recherche?category=9&real_estate_type=3&price={self.plancher}-{self.plafond}"
                f"&locations=d_{dep}&page={p}" for p in range(1, 4)]

    def collecter(self, dep):
        for url in self.recherches(dep, self.urls_recherche(dep))[: self.max_pages]:
            try:
                html = self._page(url)
            except Bloque as e:
                log.warning("[leboncoin] bloqué : %s", e)
                return
            s = BeautifulSoup(html, "html.parser").find("script", id="__NEXT_DATA__")
            if not s:
                return
            data = json.loads(s.string)
            ads = (data.get("props", {}).get("pageProps", {}).get("searchData", {}) or {}).get("ads") or []
            if not ads:
                return
            for x in ads:
                loc = x.get("location") or {}
                attrs = {a.get("key"): a.get("value") for a in x.get("attributes") or []}
                prix = (x.get("price") or [None])[0]
                surf = attrs.get("land_plot_surface") or attrs.get("square")
                yield Annonce(
                    source=self.nom, source_id=str(x.get("list_id")), url=x.get("url") or "",
                    departement=str(loc.get("department_id") or dep).zfill(2), titre=x.get("subject") or "",
                    description=x.get("body") or "", prix=prix,
                    surface_m2=float(surf) if surf and str(surf).replace(".", "").isdigit() else parse_surface(x.get("body") or ""),
                    commune=loc.get("city"), code_postal=loc.get("zipcode"), lat=loc.get("lat"), lon=loc.get("lng"),
                    precision_geo="commune" if loc.get("is_shape") is False or not loc.get("lat") else "approx",
                    photo_url=((x.get("images") or {}).get("urls") or [None])[0],
                    date_publication=(x.get("first_publication_date") or "")[:10],
                    brut={"owner": {"type": (x.get("owner") or {}).get("type"), "name": (x.get("owner") or {}).get("name")}})


class ImportManuel:
    """Import d'annonces depuis un fichier CSV/JSON (copier-coller, export d'une extension navigateur, sites non couverts).

    Colonnes : url, titre, description, prix, surface_m2, commune, code_postal, departement, [lat, lon, ref_cadastrale, source]
    """
    nom, libelle = "import", "Import manuel"

    def __init__(self, chemin):
        self.chemin = chemin

    def lire(self):
        import csv
        if self.chemin.endswith(".json"):
            with open(self.chemin, encoding="utf-8") as f:
                rows = json.load(f)
        else:
            with open(self.chemin, encoding="utf-8-sig") as f:
                sample = f.read(2048)
                f.seek(0)
                rows = list(csv.DictReader(f, dialect=csv.Sniffer().sniff(sample, delimiters=";,\t")))
        for i, r in enumerate(rows):
            def num(k):
                v = str(r.get(k) or "").replace("€", "").replace(" ", "").replace(" ", "").replace(",", ".")
                return float(v) if re.fullmatch(r"\d+(\.\d+)?", v) else None
            cp = str(r.get("code_postal") or "").strip()
            dep = str(r.get("departement") or cp[:2]).zfill(2)
            url = r.get("url") or f"import:{i}"
            yield Annonce(
                source=r.get("source") or "import", source_id=re.sub(r"\W+", "-", url)[-80:], url=url, departement=dep,
                titre=r.get("titre") or "", description=r.get("description") or "", prix=num("prix"),
                surface_m2=num("surface_m2") or parse_surface(r.get("description") or ""), commune=r.get("commune"),
                code_postal=cp or None, lat=num("lat"), lon=num("lon"),
                precision_geo="adresse" if num("lat") else None, ref_cadastrale=r.get("ref_cadastrale") or None)


SITES = {c.nom: c for c in (ParuVendu, GreenAcres, ProprietesRurales, Figaro, Agorastore, SeLoger, LogicImmo, LeBonCoin)}
