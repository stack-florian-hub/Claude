"""Qualification des annonces : seuils de prix et analyse sémantique (règles NLP) de la description.

Les règles sont volontairement explicites (expressions régulières commentées) plutôt qu'un modèle statistique :
chaque exclusion est explicable et le vocabulaire des annonces foncières est très stéréotypé.
"""
import re
import unicodedata

from .models import Annonce


def normaliser(txt):
    """Minuscules, sans accents, espaces simples, entités HTML courantes retirées."""
    txt = (txt or "").replace("&sup2;", "2").replace("&nbsp;", " ").replace(" ", " ").replace(" ", " ")
    txt = txt.replace("€", " eur ").replace("²", "2")
    txt = re.sub(r"<[^>]+>", " ", txt)
    txt = unicodedata.normalize("NFKD", txt).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", txt).strip()


# --- Montants -----------------------------------------------------------------------------------
_MONTANT = re.compile(
    r"(?<![\d.,])(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)\s*(k\s*(?:e|euros?|€)|keur|€|e\b|eur\b|euros?\b)", re.I)


def montants(txt):
    """Liste des (montant en €, position) trouvés dans un texte normalisé."""
    out = []
    for m in _MONTANT.finditer(txt):
        brut, unite = m.group(1), m.group(2).lower().replace(" ", "")
        if re.fullmatch(r"\d{1,3}(?:[ .]\d{3})+", brut):
            v = float(re.sub(r"[ .]", "", brut))
        else:
            v = float(brut.replace(",", "."))
        if unite.startswith("k"):
            v *= 1000
        out.append((v, m.start()))
    return out


def parse_prix(txt):
    vals = [v for v, _ in montants(normaliser(txt))]
    return vals[0] if vals else None


_SURF = re.compile(r"(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)\s*(m2|m²|metres? carres?|ha\b|hectares?|a\b|ares?|ca\b)")
_HA_A_CA = re.compile(r"(\d+)\s*ha\s*(\d+)\s*a(?:\s*(\d+)\s*ca)?")


def parse_surface(txt):
    """Surface terrain en m² (gère m², ha, ares, notation cadastrale « 1 ha 25 a 30 ca »)."""
    t = normaliser(txt).replace("m²", "m2")
    m = _HA_A_CA.search(t)
    if m:
        return int(m.group(1)) * 10000 + int(m.group(2)) * 100 + int(m.group(3) or 0)
    best = None
    for m in _SURF.finditer(t):
        brut, u = m.group(1), m.group(2)
        v = float(re.sub(r"[ .]", "", brut)) if re.fullmatch(r"\d{1,3}(?:[ .]\d{3})+", brut) else float(brut.replace(",", "."))
        if u.startswith("ha") or u.startswith("hect"):
            v *= 10000
        elif u in ("a", "are", "ares"):
            v *= 100
        elif u == "ca":
            continue
        best = max(best or 0, v)   # la plus grande surface citée est en général celle du terrain
    return best


# --- Référence cadastrale -----------------------------------------------------------------------
_CADASTRE = re.compile(
    r"(?:cadastr\w*|parcelles?|section|ref(?:erence)?\.? cadastrale)\s*(?:n[o°]?\s*|:\s*)?"
    r"(?:section\s*)?([a-z]{1,2}|0[a-z])\s*(?:n[o°]?\s*|numero\s*|-\s*)?(\d{1,4})\b")


def parse_cadastre(txt):
    """Renvoie (section, numéro) si la description cite une parcelle (« parcelle ZK 123 », « section AB n°45 »)."""
    t = normaliser(txt)
    for m in _CADASTRE.finditer(t):
        sec = m.group(1).upper()
        if sec in ("N", "NO", "DE", "DU", "LA", "LE", "EN", "ET", "UN"):
            continue
        return sec.rjust(2, "0"), m.group(2).zfill(4)
    return None


# --- Typologie ----------------------------------------------------------------------------------
TYPOLOGIES = [
    ("constructible", r"\b(constructible|a batir|viabilise|lotissement|cu positif|certificat d.urbanisme (positif|operationnel)|permis d.amenager)\b"),
    ("etang", r"\b(etang|plan d.eau|mare)\b"),
    ("bois", r"\b(bois|boise|foret|forestier|taillis|futaie|peupleraie|sapiniere|chenaie)\b"),
    ("agricole", r"\b(agricole|prairie|pres?|pature|paturage|terre labourable|terres? agricoles?|culture|vigne|verger|fermage)\b"),
    ("loisir", r"\b(loisirs?|agrement|jardin|potager|terrain de loisir|detente|cabanon|caravane|camping prive)\b"),
]


def typologie(txt):
    t = normaliser(txt)
    non_constr = re.search(r"\b(non|in) ?constructible|pas constructible|zone (n|a)\b", t)
    for nom, rx in TYPOLOGIES:
        if nom == "constructible" and non_constr:
            continue
        if re.search(rx, t):
            return nom
    return "autre"


# --- Exclusions sémantiques ---------------------------------------------------------------------
EXCLUSIONS = [
    ("viager", r"\bviager\b|\bbouquet\b.{0,40}\brente\b|\brente viagere\b"),
    ("gff_parts", r"\bgroupement (foncier|forestier)\b|\bg\.?f\.?f\.?\b|\bg\.?f\.?a\.?\b|\bparts? (sociales?|de (sci|gfa|gff|groupement))\b"),
    ("indivision", r"\b(en indivision|quote[ -]part|droits? indivis|parts? indivises?|\d+ ?/ ?\d+ (indivis|des droits)|indivis a hauteur)\b"),
    ("demembrement", r"\bnue[ -]propriete\b|\busufruit\b"),
    ("location", r"\b(a louer|location|loyer|par mois|/ ?mois)\b(?!.{0,30}\b(bail rural|fermage)\b)"),
    ("recherche", r"^(je |nous )?(recherche|cherche|achete)\b|\b(recherche|cherche) (un |une )?terrain\b"),
    ("pas_un_terrain", r"\b(emplacement de camping|mobil[ -]?home sur (emplacement|camping)|concession funeraire|place de parking|box ferme)\b"),
]

# Contexte d'un montant cité dans le texte qui trahit le vrai prix
_CTX_PRIX = re.compile(
    r"(prix (reel|net|de vente|vendeur|demande|total|fai|honoraires inclus)|au prix de|vendu (a|pour)|net vendeur|"
    r"faire offre|offre a partir|a partir de|mise a prix|prix :|prix=|estime a|valeur)")


def prix_dans_texte(txt, prix_affiche):
    """Détecte un « vrai » prix cité dans la description, très supérieur au prix affiché.

    Renvoie le montant suspect ou None. On exige un mot de contexte dans les 40 caractères qui précèdent
    et un montant > 2,5 × le prix affiché (un « 1 500 € de frais de notaire » ne déclenche rien).
    """
    if not prix_affiche:
        return None
    t = normaliser(txt)
    for v, pos in montants(t):
        avant = t[max(0, pos - 40):pos]
        if v > 2.5 * prix_affiche and v >= 1000 and _CTX_PRIX.search(avant):
            return v
    if re.search(r"\bprix (d.appel|symbolique|indicatif)\b|\bprix (affiche )?(non contractuel|fictif)\b", t):
        return -1.0
    return None


ALERTES = [
    ("enclave", r"\b(enclave|sans acces|pas d.acces|acces (par|via) (un )?(voisin|servitude))\b", "Terrain possiblement enclavé"),
    ("inondable", r"\b(inondable|ppri|zone humide|submersible|crue)\b", "Mention de risque d'inondation / zone humide"),
    ("bail_rural", r"\b(bail rural|fermage|loue a un agriculteur|exploite par)\b", "Bail rural en cours (fermier en place, droit de préemption)"),
    ("servitude", r"\bservitude\b", "Servitude mentionnée"),
    ("ligne_ht", r"\b(ligne (a )?haute tension|pylone|tht)\b", "Ligne haute tension"),
    ("non_constructible", r"\b(non|in) ?constructible\b", "Annoncé non constructible"),
    ("viabilise", r"\b(viabilise|eau et electricite|raccordable|tout a l.egout|reseaux? (en|a) (bordure|proximite))\b", "Réseaux à proximité"),
    ("acces_route", r"\b(bord de route|bordure de (route|voie|chemin)|acces direct|acces (par )?(chemin|route) (communal|goudronne|carrossable))\b", "Accès voie mentionné"),
    ("bourg", r"\b(proche|pres|sortie|entree|a \d+ ?(m|km|min)( du| de)?) (du )?(bourg|centre|village|ecoles?|commerces)\b|\ben limite (de )?(zone|lotissement|bourg)\b", "Proximité bourg / zone urbanisée mentionnée"),
    ("puits", r"\b(puits|forage|source)\b", "Point d'eau (puits/forage/source)"),
    ("abri", r"\b(abri|cabanon|chalet|hangar|grange|batiment agricole)\b", "Construction légère / bâtiment existant"),
]


def analyser(a: Annonce):
    """Analyse sémantique : (motif d'exclusion ou None, liste d'alertes {code, libelle})."""
    texte = f"{a.titre} . {a.description}"
    t = normaliser(texte)
    motif = None
    for code, rx in EXCLUSIONS:
        if re.search(rx, t):
            motif = code
            break
    if motif is None:
        reel = prix_dans_texte(texte, a.prix)
        if reel:
            motif = "prix_reel_texte"
            if reel > 0:
                a.brut["prix_reel_detecte"] = reel
    alertes = [{"code": c, "libelle": lib} for c, rx, lib in ALERTES if re.search(rx, t)]
    return motif, alertes


def qualifier(a: Annonce, cfg):
    """Applique seuils de prix/surface puis l'analyse sémantique. Renvoie (motif d'exclusion | None, alertes)."""
    p = cfg["prix"]
    if a.departement not in cfg["departements"]:
        return "hors_zone", []
    if a.typologie is None:
        a.typologie = typologie(f"{a.titre} {a.description}")
    if a.prix is None:
        return "prix_absent", []
    if a.prix < p["plancher"]:
        return "prix_plancher", []
    plafond = p.get("plafond_par_typologie", {}).get(a.typologie, p["plafond"])
    if a.prix > plafond:
        return "prix_plafond", []
    s = cfg.get("surface", {})
    if a.surface_m2:
        if a.surface_m2 < s.get("min_m2", 0) or a.surface_m2 > s.get("max_m2", 1e12):
            return "surface_hors_bornes", []
        if p.get("prix_m2_max") and a.typologie != "constructible" and a.prix / a.surface_m2 > p["prix_m2_max"]:
            return "prix_m2_trop_eleve", []
    return analyser(a)
