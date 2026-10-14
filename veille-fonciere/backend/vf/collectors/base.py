"""Socle commun des collecteurs.

Deux familles :
- collecteurs « API » (notaires, Bien'Ici) : JSON structuré, fiables ;
- collecteur générique HTML (`CollecteurHtml`) : page de recherche -> liens d'annonces -> page détail,
  puis extraction par ordre de fiabilité : JSON-LD schema.org, __NEXT_DATA__, balises meta, texte.
  Chaque site ne déclare que ses URL de recherche et le motif de ses liens d'annonces.
"""
import html as htmlmod
import json
import logging
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from ..filters import parse_prix, parse_surface
from ..http import Bloque
from ..models import Annonce

log = logging.getLogger("vf.collect")

DEP_NOMS = {"85": "vendee", "44": "loire-atlantique", "49": "maine-et-loire", "37": "indre-et-loire"}


class Collecteur:
    nom = "?"
    libelle = "?"

    def __init__(self, http, cfg):
        self.http, self.cfg = http, cfg
        self.max_pages = cfg["collecte"].get("max_pages_par_source", 10)
        self.plafond = max([cfg["prix"]["plafond"], *cfg["prix"].get("plafond_par_typologie", {}).values()])
        self.plancher = cfg["prix"]["plancher"]

    def collecter(self, dep):
        """Génère des Annonce pour un département."""
        raise NotImplementedError

    def recherches(self, dep, defaut):
        """URL de recherche : celles de config.json > recherches > <source> > <dep> si présentes."""
        perso = self.cfg.get("recherches", {}).get(self.nom, {}).get(dep)
        if perso:
            return perso if isinstance(perso, list) else [perso]
        return defaut


# --- extraction générique -------------------------------------------------------------------------
def _jsonld(soup):
    out = []
    for s in soup.find_all("script", type="application/ld+json"):
        try:
            d = json.loads(s.string or "")
        except (ValueError, TypeError):
            continue
        items = d if isinstance(d, list) else d.get("@graph", [d]) if isinstance(d, dict) else []
        out += [i for i in items if isinstance(i, dict)]
    return out


def _meta(soup, *noms):
    for n in noms:
        t = soup.find("meta", attrs={"property": n}) or soup.find("meta", attrs={"name": n})
        if t and t.get("content"):
            return htmlmod.unescape(t["content"]).strip()
    return ""


def _description(soup):
    """Texte de description le plus probable : bloc dont la classe/id contient « description »."""
    best = ""
    for el in soup.find_all(attrs={"class": re.compile("descr", re.I)}) + soup.find_all(id=re.compile("descr", re.I)):
        t = el.get_text(" ", strip=True)
        if len(t) > len(best):
            best = t
    return best[:6000]


_CP_COMMUNE = re.compile(r"(?:à|a)\s+([A-ZÉÈÀÂÎÔÛa-zéèêàâîôûç' -]{2,60}?)\s*\((\d{5})\)")
_CP = re.compile(r"\b(85|44|49|37)\d{3}\b")


def extraire_detail(html, url, source, dep_attendu=None):
    """Annonce à partir d'une page détail HTML quelconque. Renvoie None si rien d'exploitable."""
    soup = BeautifulSoup(html, "html.parser")
    titre = _meta(soup, "og:title") or (soup.title.get_text(strip=True) if soup.title else "")
    meta_desc = _meta(soup, "og:description", "description")
    desc = _description(soup) or meta_desc
    prix = surface = None
    commune = cp = None
    lat = lon = None
    for it in _jsonld(soup):
        offers = it.get("offers")
        if isinstance(offers, list):
            offers = offers[0] if offers else None
        if isinstance(offers, dict) and offers.get("price"):
            try:
                prix = float(str(offers["price"]).replace(" ", "").replace(",", "."))
            except ValueError:
                pass
        for k in ("lotSize", "floorSize", "size"):
            v = it.get(k)
            if isinstance(v, dict) and v.get("value"):
                try:
                    surface = surface or float(v["value"])
                except ValueError:
                    pass
        addr = it.get("address")
        if not addr and isinstance(it.get("itemOffered"), dict):
            addr = it["itemOffered"].get("address")
        if isinstance(addr, dict):
            commune = commune or addr.get("addressLocality")
            cp = cp or addr.get("postalCode")
        g = it.get("geo")
        if isinstance(g, dict) and g.get("latitude"):
            lat, lon = float(g["latitude"]), float(g["longitude"])
    texte = f"{titre} . {meta_desc} . {desc}"
    if prix is None:
        m = re.search(r"(?:prix|au prix de|vendu)\D{0,15}((?:\d{1,3}[ .  ])*\d+ ?€)", texte, re.I)
        prix = parse_prix(m.group(1)) if m else None
    surface = surface or parse_surface(f"{titre} . {meta_desc}") or parse_surface(desc)
    if not cp:
        m = _CP_COMMUNE.search(f"{titre} {meta_desc}")
        if m:
            commune, cp = m.group(1).strip(), m.group(2)
        else:
            m = _CP.search(texte)
            cp = m.group(0) if m else None
    dep = (cp or "")[:2] or dep_attendu
    if not dep or prix is None:
        return None
    sid = re.sub(r"\W+", "-", url.split("?")[0].rstrip("/").split("/")[-1])[:80]
    return Annonce(source=source, source_id=sid, url=url, departement=dep, titre=titre[:300], description=desc or meta_desc,
                   prix=prix, surface_m2=surface, commune=commune, code_postal=cp, lat=lat, lon=lon,
                   precision_geo="adresse" if lat else None, photo_url=_meta(soup, "og:image") or None)


class CollecteurHtml(Collecteur):
    """Collecteur générique : sous-classes définissent `urls_recherche(dep)` et `motif_lien`."""
    motif_lien = None          # regex sur l'attribut href des annonces
    besoin_js = False          # True : rendu via Playwright
    selecteur_attente = None   # sélecteur CSS à attendre en mode JS
    max_annonces = 60

    def urls_recherche(self, dep):
        raise NotImplementedError

    def _page(self, url):
        if self.besoin_js:
            return self.http.rendu(url, self.selecteur_attente)
        return self.http.get(url).text

    def liens(self, html, base):
        vus = []
        for href in re.findall(r'href="([^"]+)"', html):
            href = htmlmod.unescape(href)
            if re.search(self.motif_lien, href):
                u = urljoin(base, href.split("#")[0])
                if u not in vus:
                    vus.append(u)
        return vus

    def collecter(self, dep):
        liens = []
        for url in self.recherches(dep, self.urls_recherche(dep))[: self.max_pages]:
            try:
                liens += [l for l in self.liens(self._page(url), url) if l not in liens]
            except Bloque as e:
                log.warning("[%s] recherche bloquée : %s", self.nom, e)
                return
            except requests.HTTPError as e:   # page de résultats inexistante (pagination épuisée)
                log.info("[%s] %s", self.nom, e)
                continue
        for u in liens[: self.max_annonces]:
            try:
                a = extraire_detail(self._page(u), u, self.nom, dep)
            except Bloque as e:
                log.warning("[%s] détail bloqué : %s", self.nom, e)
                return
            except Exception as e:
                log.warning("[%s] %s : %s", self.nom, u, e)
                continue
            if a and a.departement == dep:
                yield a
