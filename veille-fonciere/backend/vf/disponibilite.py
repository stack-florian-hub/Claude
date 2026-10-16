"""Vérifie que les annonces actives sont toujours en vente et archive celles vendues ou retirées.

- Bien'Ici : status.onTheMarket passe à false quand le bien est vendu ou que le mandat est retiré
- Immobilier.notaires.fr : statut de l'annonce (LIGNE sinon), indicateurs bienVendu / bienRetire
- autres sites : page disparue (404 / 410) ou mention « vendu » / « plus disponible »
Les annonces archivées gardent leurs notes ; elles passent au statut « retiree » avec le motif « vendu ».
"""
import logging
import re

import requests

from .db import now
from .filters import normaliser
from .http import Bloque

log = logging.getLogger("vf.dispo")


def statut(http, source, source_id, url):
    """Renvoie 'en_vente', 'vendu' (vendu ou retiré) ou None si on ne sait pas."""
    if source == "bienici":
        d = http.get_json("https://www.bienici.com/realEstateAd.json", params={"id": source_id}, ttl_h=6)
        st = d.get("status") or {}
        if d.get("isSold") or st.get("onTheMarket") is False or st.get("closedByUser"):
            return "vendu"
        return "en_vente" if st.get("onTheMarket") else None
    if source == "notaires":
        d = http.get_json(f"https://www.immobilier.notaires.fr/pub-services/inotr-www-annonces/v1/annonces/{source_id}", ttl_h=6)
        v = d.get("vente") or {}
        if d.get("status") not in (None, "LIGNE") or v.get("bienVendu") == "OUI" or v.get("bienRetire") == "OUI":
            return "vendu"
        return "en_vente"
    if not url.startswith("http"):
        return None
    try:
        r = http.get(url)
    except requests.HTTPError as e:
        return "vendu" if e.response is not None and e.response.status_code in (404, 410) else None
    t = normaliser(r.text[:200000])
    if re.search(r"\b(bien vendu|terrain vendu|annonce (n.est plus|plus) disponible|cette annonce a ete (retiree|desactivee))\b", t):
        return "vendu"
    return "en_vente"


def verifier(con, http):
    """Contrôle toutes les annonces actives. Renvoie la liste des identifiants archivés."""
    archives = []
    for r in con.execute("SELECT id, source, source_id, url FROM annonces WHERE statut='active'").fetchall():
        try:
            s = statut(http, r["source"], r["source_id"], r["url"])
        except (Bloque, Exception) as e:
            log.warning("disponibilité %s : %s", r["id"], e)
            continue
        if s == "vendu":
            con.execute("UPDATE annonces SET statut='retiree', motif_exclusion='vendu', derniere_vue=? WHERE id=?", (now(), r["id"]))
            archives.append(r["id"])
            log.info("archivée (vendue ou retirée) : %s", r["id"])
    con.commit()
    return archives
