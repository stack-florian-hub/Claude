"""Honoraires de négociation (agence ou notaire) d'une annonce : montant, % et qui les paie.

Le % est exprimé, comme l'impose l'affichage légal, par rapport au prix hors honoraires (ce que touche le vendeur).
Sources, par ordre de fiabilité : champs structurés (notaires : émoluments de négociation et prix net),
puis mentions légales de la description (« dont 1 800 € TTC d'honoraires », « Prix hors honoraires : 7 700 € »,
« 25,97 % du prix hors honoraires », « honoraires à la charge du vendeur »).
"""
import re

from .filters import montants, normaliser

_PCT = [
    re.compile(r"(\d{1,3}(?:[.,]\d{1,2})?)\s*%\s*(?:ttc\s*)?(?:d.honoraires|hon\b|honoraires)"),
    re.compile(r"\((\d{1,3}(?:[.,]\d{1,2})?)\s*%\s*(?:ttc\s*)?du prix"),
    re.compile(r"honoraires[^%.]{0,60}?(?:soit|de)\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*%"),
]


def _montant_apres(t, motif):
    m = re.search(motif, t)
    if not m:
        return None
    vals = montants(t[m.end():m.end() + 40])
    return vals[0][0] if vals else None


def analyser(prix, description, brut=None, contact=None):
    """Renvoie {pct, montant, net, charge} (valeurs None si inconnues) ou None si rien n'est indiqué."""
    brut = brut or {}
    if brut.get("emoluments") is not None and brut.get("prixAffiche"):
        net, mt = float(brut["prixAffiche"]), float(brut["emoluments"])
        return {"pct": round(100 * mt / net, 1) if net else None, "montant": mt, "net": net, "charge": "acquereur"}
    t = normaliser(description)
    charge = None
    if re.search(r"(charge|a la charge)\s*(du|de la)?\s*vendeu", t):
        charge = "vendeur"
    elif re.search(r"(charge|a la charge)\s*(de l.)?\s*(acquereur|acheteur)|charge acq", t):
        charge = "acquereur"
    elif (contact or {}).get("frais_charge") in ("seller", "buyer"):
        charge = "vendeur" if contact["frais_charge"] == "seller" else "acquereur"
    pct = mt = net = None
    for rx in _PCT:
        m = rx.search(t)
        if m:
            pct = float(m.group(1).replace(",", "."))
            break
    net = _montant_apres(t, r"prix (hors|hors hon\.?|hors honoraires|net vendeur)[^:0-9]{0,30}:?")
    m = re.search(r"dont\s*([\d .]+)\s*(eur|e\b)[^.]{0,20}(ttc )?d.honoraires", t)
    if m:
        mt = montants(m.group(0))[0][0] if montants(m.group(0)) else None
    if prix:
        if mt is None and net and net < prix:
            mt = prix - net
        if mt is not None and net is None:
            net = prix - mt
        if pct is None and mt is not None and net:
            pct = round(100 * mt / net, 1)
        if mt is None and pct is not None:
            net = round(prix / (1 + pct / 100))
            mt = prix - net
    if charge == "vendeur" and pct is None:
        return {"pct": None, "montant": None, "net": None, "charge": "vendeur"}
    if pct is None and charge is None:
        return None
    return {"pct": pct, "montant": mt, "net": net, "charge": charge or ("acquereur" if pct else None)}
