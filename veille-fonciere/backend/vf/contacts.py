"""Coordonnées de l'annonceur (agent, notaire, agence ou particulier) à partir de la fiche source.

- Bien'Ici : realEstateAd.json -> contactRelativeData (nom de l'agent / de l'agence, téléphone, ville de l'agence)
- Immobilier.notaires.fr : annonce détaillée -> contact (négociateur, téléphone, email, adresse de l'étude)
- ParuVendu : nom de l'agence et son site (le téléphone n'est révélé qu'au clic sur le site)
- LeBonCoin : nom et type d'annonceur (le téléphone exige d'être connecté au site)
Uniquement les coordonnées que l'annonceur publie lui-même pour être contacté au sujet de son annonce.
"""
import json
import logging
import re
from urllib.parse import parse_qs, unquote, urlparse

from .db import now
from .http import Bloque

log = logging.getLogger("vf.contacts")


def _tel(t):
    t = re.sub(r"\D", "", str(t or ""))
    if t.startswith("33") and len(t) == 11:
        t = "0" + t[2:]
    return " ".join(t[i:i + 2] for i in range(0, len(t), 2)) if len(t) == 10 else (t or None)


def bienici(http, a):
    d = http.get_json("https://www.bienici.com/realEstateAd.json", params={"id": a.source_id}, ttl_h=24 * 7)
    c = d.get("contactRelativeData") or {}
    if not c:
        return None
    nom = c.get("contactNameToDisplay") or c.get("agencyNameToDisplay")
    agence, _, personne = (nom or "").partition(" / ")
    adr = c.get("address") or {}
    return {"type": "pro" if c.get("contactIsPro") else "particulier", "nom": personne or None, "agence": agence or nom,
            "telephone": _tel(c.get("phoneToDisplay")), "email": None,
            "adresse": " ".join(x for x in (adr.get("postalCode"), adr.get("city")) if x) or None,
            "site": d.get("agencyFeeUrl"), "frais_charge": d.get("feesChargedTo")}


def notaires(http, a):
    d = http.get_json(f"https://www.immobilier.notaires.fr/pub-services/inotr-www-annonces/v1/annonces/{a.source_id}", ttl_h=24 * 7)
    c = d.get("contact") or {}
    if not c:
        return None
    return {"type": "notaire", "nom": c.get("nom"), "agence": f"Office notarial (CRPCEN {d.get('crpcen')})" if d.get("crpcen") else "Office notarial",
            "telephone": _tel(c.get("telephone")), "email": c.get("mail"),
            "adresse": ", ".join(x for x in (c.get("adresse4"), " ".join(y for y in (c.get("codePostal"), c.get("ville")) if y)) if x) or None,
            "site": None}


def paruvendu(http, a):
    h = http.get(a.url).text
    i = h.find("annonceur flex flex-col gap-1")
    if i < 0:
        return None
    seg = re.sub(r"<(script|style).*?</\1>", " ", h[i:i + 4000], flags=re.S)
    textes = [t.strip() for t in re.sub(r"<[^>]+>", "\n", seg).split("\n") if t.strip() and not t.strip().startswith(("&#", "{", "."))]
    agence = textes[1] if len(textes) > 1 and "annonce" not in textes[1].lower() else None
    m = re.search(r'Annonceur\?url=([^"&]+)', h)
    site = unquote(m.group(1)) if m else None
    return {"type": "pro", "nom": None, "agence": agence, "telephone": None, "email": None, "adresse": None, "site": site,
            "remarque": "Téléphone affiché au clic sur l'annonce ParuVendu"}


def leboncoin(http, a, brut):
    o = brut.get("owner") or {}
    return {"type": "pro" if o.get("type") == "pro" else "particulier", "nom": o.get("name"), "agence": None,
            "telephone": None, "email": None, "adresse": None, "site": None,
            "remarque": "Téléphone visible sur LeBonCoin une fois connecté (bouton « Voir le numéro »)"}


SOURCES = {"bienici": bienici, "notaires": notaires, "paruvendu": paruvendu}


def recuperer(con, http, a, brut=None):
    """Récupère et enregistre le contact d'une annonce. Renvoie le dict ou None."""
    try:
        if a.source == "leboncoin":
            c = leboncoin(http, a, brut or {})
        elif a.source in SOURCES:
            c = SOURCES[a.source](http, a)
        else:
            return None
    except (Bloque, Exception) as e:
        log.warning("contact %s : %s", a.id, e)
        return None
    if c:
        con.execute("INSERT OR REPLACE INTO contacts VALUES (?,?,?)", (a.id, json.dumps(c, ensure_ascii=False), now()))
    return c
