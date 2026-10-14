"""Comparables DVF (Demandes de Valeurs Foncières, Etalab « geo-dvf ») pour le foncier non bâti.

Source : https://files.data.gouv.fr/geo-dvf/latest/csv/<année>/communes/<dep>/<insee>.csv (mutations géolocalisées).
On ne garde que les mutations « Vente » / « Adjudication » d'une seule commune, sans aucun local bâti,
et on les classe par typologie selon la nature de culture dominante (en surface).
"""
import csv
import io
import logging
import statistics
from collections import defaultdict

from .db import now

log = logging.getLogger("vf.dvf")
URL = "https://files.data.gouv.fr/geo-dvf/latest/csv/{annee}/communes/{dep}/{insee}.csv"

# Nature de culture DVF -> typologie de l'outil
NATURE_TYPO = {
    "AB": "constructible",
    "AG": "loisir", "J": "loisir",
    "E": "etang",
    "BF": "bois", "BM": "bois", "BO": "bois", "BP": "bois", "BR": "bois", "BS": "bois", "BT": "bois", "LB": "bois",
    "T": "agricole", "P": "agricole", "PA": "agricole", "PE": "agricole", "PH": "agricole", "PP": "agricole",
    "VE": "agricole", "VI": "agricole", "L": "agricole",
}
# Typologie d'annonce -> typologies DVF comparables (dans l'ordre de préférence)
COMPARABLES = {
    "constructible": ["constructible"],
    "loisir": ["loisir", "etang"],
    "etang": ["etang", "loisir"],
    "bois": ["bois"],
    "agricole": ["agricole"],
    "autre": ["loisir", "agricole", "bois", "etang"],
}
# Repères régionaux (€/m²) quand la commune n'a pas assez de ventes : ordres de grandeur Pays de la Loire /
# Centre-Val de Loire (barème Agreste des terres et prés libres ~ 0,4-0,7 €/m², forêts ~ 0,4-0,6 €/m²,
# terrains de loisir 1-5 €/m²). Remplacés par la médiane départementale dès que le cache local en a assez.
REPERES = {"agricole": 0.6, "bois": 0.5, "loisir": 2.5, "etang": 1.5, "constructible": 60.0, "autre": 1.5}


def _typo_mutation(rows):
    surf = defaultdict(float)
    for r in rows:
        try:
            surf[NATURE_TYPO.get(r["code_nature_culture"], "autre")] += float(r["surface_terrain"] or 0)
        except ValueError:
            pass
    return max(surf, key=surf.get) if surf else "autre"


def charger_commune(con, http, insee, annees):
    """Télécharge (cache) et stocke les ventes de foncier non bâti d'une commune. Renvoie le nombre retenu."""
    if con.execute("SELECT 1 FROM dvf_stats WHERE code_insee=? AND typologie='_charge' AND calcule_le > date('now','-30 day')",
                   (insee,)).fetchone():
        return None
    n = 0
    for an in annees:
        txt = http.get_text_cache(URL.format(annee=an, dep=insee[:2], insee=insee))
        if not txt or not txt.startswith("id_mutation"):
            continue
        muts = defaultdict(list)
        for r in csv.DictReader(io.StringIO(txt)):
            muts[r["id_mutation"]].append(r)
        for mid, rows in muts.items():
            r0 = rows[0]
            if r0["nature_mutation"] not in ("Vente", "Adjudication") or not r0["valeur_fonciere"]:
                continue
            if any(r["type_local"] in ("Maison", "Appartement", "Local industriel. commercial ou assimilé") for r in rows):
                continue
            if any(r["code_commune"] != insee for r in rows) or any(r["code_nature_culture"] == "S" for r in rows):
                continue
            uniq = {(r["id_parcelle"], r["code_nature_culture"], r["surface_terrain"]) for r in rows if r["surface_terrain"]}
            surface = sum(float(s) for _, _, s in uniq)
            if surface < 100:
                continue
            valeur = float(r0["valeur_fonciere"])
            pm2 = valeur / surface
            if not 0.05 <= pm2 <= 500:
                continue
            idp = r0["id_parcelle"] or ""
            con.execute(
                "INSERT OR REPLACE INTO dvf_ventes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (mid, insee, r0["date_mutation"], valeur, surface, round(pm2, 3), _typo_mutation(rows),
                 ",".join(sorted({r["nature_culture"] for r in rows if r["nature_culture"]})), idp[8:10] if len(idp) == 14 else None,
                 idp, float(r0["latitude"]) if r0["latitude"] else None, float(r0["longitude"]) if r0["longitude"] else None))
            n += 1
    con.execute("INSERT OR REPLACE INTO dvf_stats (code_insee, typologie, section, n, calcule_le) VALUES (?,?,?,?,?)",
                (insee, "_charge", "", n, now()))
    con.commit()
    return n


def _quantile(vals, p):
    vals = sorted(vals)
    k = (len(vals) - 1) * p
    f = int(k)
    return vals[f] + (vals[min(f + 1, len(vals) - 1)] - vals[f]) * (k - f)


def _stats(vals):
    return {"n": len(vals), "p25_m2": round(_quantile(vals, .25), 2), "mediane_m2": round(statistics.median(vals), 2),
            "p75_m2": round(_quantile(vals, .75), 2)}


def comparer(con, insee, typologie, section, cfg, surface=None):
    """Référence DVF pour une annonce : section > commune > département (cache local) > repère régional.

    Renvoie {niveau, n, p25_m2, mediane_m2, p75_m2, ventes: [...10 plus récentes]}.
    """
    typos = COMPARABLES.get(typologie or "autre", COMPARABLES["autre"])
    marques = ",".join("?" * len(typos))
    c = cfg["dvf"]
    rows = [dict(r) for r in con.execute(
        f"SELECT * FROM dvf_ventes WHERE code_insee=? AND typologie IN ({marques}) ORDER BY date DESC", (insee, *typos))]
    # Le prix au m² dépend fortement de la taille : on compare d'abord à des surfaces du même ordre (÷3 à ×3)
    if surface:
        proches = [r for r in rows if surface / 3 <= r["surface_m2"] <= surface * 3]
        if len(proches) >= c["min_ventes_commune"]:
            rows = proches
    if section:
        sec = [r for r in rows if r["section"] == section]
        if len(sec) >= c["min_ventes_section"]:
            return {"niveau": "section", **_stats([r["prix_m2"] for r in sec]), "ventes": sec[:10]}
    if len(rows) >= c["min_ventes_commune"]:
        return {"niveau": "commune", **_stats([r["prix_m2"] for r in rows]), "ventes": rows[:10]}
    dep = [r for r in con.execute(
        f"SELECT prix_m2, surface_m2 FROM dvf_ventes WHERE substr(code_insee,1,2)=? AND typologie IN ({marques})", (insee[:2], *typos))]
    if surface and sum(1 for _, s in dep if surface / 3 <= s <= surface * 3) >= 20:
        dep = [(p, s) for p, s in dep if surface / 3 <= s <= surface * 3]
    dep = [p for p, _ in dep]
    if len(dep) >= 20:
        return {"niveau": "departement", **_stats(dep), "ventes": rows[:10]}
    ref = REPERES.get(typologie or "autre", 1.5)
    return {"niveau": "repere_regional", "n": len(rows), "p25_m2": ref * 0.6, "mediane_m2": ref, "p75_m2": ref * 1.6,
            "ventes": rows[:10]}
