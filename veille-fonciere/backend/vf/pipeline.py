"""Orchestration : collecte -> qualification -> enrichissement -> score -> export JSON."""
import json
import logging
import os
from collections import Counter

from . import db, scoring
from .collectors import COLLECTEURS, ImportManuel
from .db import annonce_from_row, now
from .enrich import Enrichisseur, sauver
from .filters import qualifier
from .http import Bloque

log = logging.getLogger("vf")


def _enregistrer(con, cfg, annonces, source):
    jid = con.execute("INSERT INTO collectes (source, debut) VALUES (?,?)", (source, now())).lastrowid
    vues = nouvelles = exclues = 0
    erreur = None
    try:
        for a in annonces:
            vues += 1
            motif, alertes = qualifier(a, cfg)
            a.brut["alertes"] = alertes
            if motif:
                exclues += 1
            nouvelles += db.upsert_annonce(con, a, "exclue" if motif else "active", motif)
    except Bloque as e:
        erreur = str(e)
        log.warning("[%s] arrêt : %s", source, e)
    except Exception as e:  # une source cassée ne doit pas interrompre les autres
        erreur = f"{type(e).__name__}: {e}"
        log.exception("[%s] erreur", source)
    con.execute("UPDATE collectes SET fin=?, vues=?, nouvelles=?, exclues=?, erreur=? WHERE id=?",
                (now(), vues, nouvelles, exclues, erreur, jid))
    con.commit()
    log.info("[%s] %d vues, %d nouvelles, %d exclues%s", source, vues, nouvelles, exclues, f" — {erreur}" if erreur else "")
    return vues


def collecter(con, http, cfg, sources=None, deps=None):
    sources = sources or [s for s in cfg["sources_actives"] if s in COLLECTEURS]
    deps = deps or cfg["departements"]
    for s in sources:
        c = COLLECTEURS[s](http, cfg)
        def flux():
            for d in deps:
                yield from c.collecter(d)
        _enregistrer(con, cfg, flux(), s)


def importer(con, cfg, chemin):
    return _enregistrer(con, cfg, ImportManuel(chemin).lire(), "import")


def requalifier(con, cfg):
    """Réapplique les filtres (après modification de config.json) sans recollecter."""
    n = 0
    for r in con.execute("SELECT * FROM annonces WHERE statut != 'retiree'").fetchall():
        a = annonce_from_row(r)
        a.typologie = None
        motif, alertes = qualifier(a, cfg)
        brut = json.loads(r["brut_json"] or "{}")
        brut["alertes"] = alertes
        con.execute("UPDATE annonces SET statut=?, motif_exclusion=?, typologie=?, brut_json=? WHERE id=?",
                    ("exclue" if motif else "active", motif, a.typologie, json.dumps(brut, ensure_ascii=False), a.id))
        n += 1
    con.commit()
    return n


def enrichir(con, http, cfg, tout=False, ids=None):
    sql = "SELECT a.* FROM annonces a LEFT JOIN enrichissements e ON e.annonce_id=a.id WHERE a.statut='active'"
    if ids:
        sql += " AND a.id IN (%s)" % ",".join("?" * len(ids))
    elif not tout:
        sql += " AND e.annonce_id IS NULL"
    rows = con.execute(sql, ids or []).fetchall()
    en = Enrichisseur(con, http, cfg)
    for i, r in enumerate(rows, 1):
        a = annonce_from_row(r)
        a.brut = json.loads(r["brut_json"] or "{}")
        e = en.enrichir(a, a.brut.get("alertes"))
        con.execute("UPDATE annonces SET lat=?, lon=?, precision_geo=?, code_insee=?, ref_cadastrale=? WHERE id=?",
                    (a.lat, a.lon, a.precision_geo, a.code_insee, a.ref_cadastrale, a.id))
        sauver(con, e)
        con.commit()
        log.info("enrichi %d/%d %s (%s, zone %s)", i, len(rows), a.id, a.precision_geo, e.get("zone_plu"))
    return len(rows)


def _enrich_dict(row):
    if row is None:
        return {}
    e = dict(row)
    e.update(json.loads(e.pop("details_json") or "{}"))
    e["erreurs"] = json.loads(e.get("erreurs") or "[]")
    return e


def scorer(con, cfg):
    rows = con.execute("SELECT a.*, e.annonce_id AS eid FROM annonces a JOIN enrichissements e ON e.annonce_id=a.id "
                       "WHERE a.statut='active'").fetchall()
    for r in rows:
        a = annonce_from_row(r)
        e = _enrich_dict(con.execute("SELECT * FROM enrichissements WHERE annonce_id=?", (a.id,)).fetchone())
        s = scoring.scorer(a, e, cfg)
        con.execute("INSERT OR REPLACE INTO scores VALUES (?,?,?,?,?,?,?,?,?)",
                    (a.id, s["score"], s["s_decote"], s["s_mutation"], s["s_acces"], s["s_rarete"], s["confiance"],
                     json.dumps(s["explications"], ensure_ascii=False), now()))
    con.commit()
    return len(rows)


def localiser(con, annonce_id, idu):
    """Saisie manuelle de la parcelle (IDU 14 caractères, ex. 85147000ZK0123) puis ré-enrichissement."""
    idu = idu.replace(" ", "").upper()
    if len(idu) != 14:
        raise ValueError("IDU attendu sur 14 caractères : INSEE(5) + préfixe(3) + section(2) + numéro(4)")
    con.execute("UPDATE annonces SET ref_cadastrale=?, lat=NULL, lon=NULL, precision_geo=NULL WHERE id=?", (idu, annonce_id))
    con.commit()


def exporter(con, chemin):
    actives = []
    q = """SELECT a.*, s.score, s.s_decote, s.s_mutation, s.s_acces, s.s_rarete, s.confiance, s.explications,
                  n.texte AS note, n.suivi, n.favori
           FROM annonces a LEFT JOIN scores s ON s.annonce_id=a.id LEFT JOIN notes n ON n.annonce_id=a.id
           WHERE a.statut='active' ORDER BY s.score DESC NULLS LAST"""
    for r in con.execute(q).fetchall():
        e = _enrich_dict(con.execute("SELECT * FROM enrichissements WHERE annonce_id=?", (r["id"],)).fetchone())
        hist = [dict(h) for h in con.execute("SELECT date, prix FROM prix_historique WHERE annonce_id=? ORDER BY date", (r["id"],))]
        brut = json.loads(r["brut_json"] or "{}")
        actives.append({
            "id": r["id"], "source": r["source"], "url": r["url"], "titre": r["titre"], "description": (r["description"] or "")[:3000],
            "prix": r["prix"], "surface_m2": r["surface_m2"], "prix_m2": round(r["prix_m2"], 2) if r["prix_m2"] else None,
            "departement": r["departement"], "commune": r["commune"], "code_insee": r["code_insee"], "code_postal": r["code_postal"],
            "lat": r["lat"], "lon": r["lon"], "precision_geo": r["precision_geo"], "ref_cadastrale": r["ref_cadastrale"],
            "typologie": r["typologie"], "mode_vente": r["mode_vente"], "photo_url": r["photo_url"],
            "date_publication": r["date_publication"], "premiere_vue": r["premiere_vue"], "derniere_vue": r["derniere_vue"],
            "prix_initial": r["prix_initial"], "historique_prix": hist,
            "score": r["score"], "s_decote": r["s_decote"], "s_mutation": r["s_mutation"], "s_acces": r["s_acces"],
            "s_rarete": r["s_rarete"], "confiance": r["confiance"], "explications": json.loads(r["explications"] or "[]"),
            "alertes": e.get("alertes") or brut.get("alertes") or [],
            "urbanisme": {k: e.get(k) for k in ("parcelle_idu", "section", "contenance_m2", "zone_plu", "type_zone", "doc_urbanisme",
                                                 "dist_zone_u_m", "dist_zone_au_m", "oap_proche_m", "prescriptions", "servitudes")},
            "environnement": {k: e.get(k) for k in ("natura2000", "znieff", "ppr_inondation", "azi", "risques_commune",
                                                     "dist_littoral_km", "agglo_proche", "dist_agglo_km", "dist_route_m", "nature_route")},
            "dvf": e.get("dvf"),
            "erreurs_enrichissement": e.get("erreurs") or [],
            "note": r["note"] or "", "suivi": r["suivi"] or "", "favori": bool(r["favori"]),
        })
    exclues = [dict(r) for r in con.execute(
        "SELECT id, source, url, titre, prix, surface_m2, departement, commune, motif_exclusion FROM annonces "
        "WHERE statut='exclue' ORDER BY derniere_vue DESC LIMIT 500")]
    motifs = Counter(r[0] for r in con.execute("SELECT motif_exclusion FROM annonces WHERE statut='exclue'"))
    collectes = [dict(r) for r in con.execute(
        "SELECT source, max(fin) AS fin, vues, nouvelles, exclues, erreur FROM collectes GROUP BY source ORDER BY source")]
    out = {"genere_le": now(), "annonces": actives, "exclues": exclues, "motifs_exclusion": dict(motifs),
           "collectes": collectes}
    os.makedirs(os.path.dirname(os.path.abspath(chemin)), exist_ok=True)
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    return len(actives)
