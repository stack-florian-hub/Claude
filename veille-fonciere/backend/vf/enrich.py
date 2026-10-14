"""Enrichissement open data d'une annonce : localisation, cadastre, PLU (GPU), environnement, risques, DVF.

API utilisées (toutes publiques, sans clé) :
- API Carto IGN  https://apicarto.ign.fr/api/doc/ : cadastre, gpu (zonage PLU, prescriptions, SUP), nature (Natura 2000, ZNIEFF)
- Géoplateforme WFS https://data.geopf.fr/wfs : BD TOPO tronçons de route (accès voie publique)
- Géorisques    https://georisques.gouv.fr/doc-api : risques de la commune, PPRN, atlas des zones inondables
- API Géo       https://geo.api.gouv.fr : code INSEE d'une commune à partir de son nom
- DVF Etalab    voir dvf.py
"""
import json
import logging

from . import dvf, geo
from .db import now
from .filters import parse_cadastre
from .http import Bloque

log = logging.getLogger("vf.enrich")
APICARTO = "https://apicarto.ign.fr/api"
WFS = "https://data.geopf.fr/wfs/ows"
GEORISQUES = "https://georisques.gouv.fr/api/v1"

# Prescriptions PLU (typepsc CNIG) utiles pour l'analyse
PSC = {"01": "Espace boisé classé (EBC)", "02": "Secteur de risque / zone inondable au PLU", "05": "Emplacement réservé",
       "15": "Zone non aedificandi", "18": "OAP (orientation d'aménagement)", "31": "Zone humide protégée",
       "07": "Élément de paysage / patrimoine protégé"}
# Servitudes d'utilité publique (suptype)
SUP = {"pm1": "PPR naturel (inondation, mouvement de terrain...)", "pm3": "PPR technologique", "i4": "Ligne électrique",
       "i3": "Canalisation gaz", "ac1": "Abords de monument historique", "ac2": "Site classé/inscrit",
       "ac4": "Site patrimonial remarquable", "el9": "Servitude de passage littoral", "a4": "Cours d'eau (passage)",
       "int1": "Voisinage cimetière", "t7": "Servitude aéronautique"}
CC_CONSTRUCTIBLE = ("01", "02", "1", "2")


def _point(lat, lon):
    return json.dumps({"type": "Point", "coordinates": [lon, lat]})


class Enrichisseur:
    def __init__(self, con, http, cfg):
        self.con, self.http, self.cfg = con, http, cfg
        self.erreurs = []

    def _api(self, url, params, defaut=None):
        try:
            return self.http.get_json(url, params=params)
        except (Bloque, Exception) as e:  # une API en panne ne doit pas bloquer tout le pipeline
            self.erreurs.append(f"{url.split('/api')[-1]}: {e}")
            log.warning("API %s : %s", url, e)
            return defaut

    # -- localisation ------------------------------------------------------------------------
    def code_insee(self, a):
        if a.code_insee:
            return a.code_insee
        if not a.commune:
            return None
        res = self._api("https://geo.api.gouv.fr/communes",
                        {"nom": a.commune, "codeDepartement": a.departement, "fields": "code,codesPostaux", "boost": "population",
                         "limit": 5}, [])
        if a.code_postal:
            res = [c for c in res if a.code_postal in c.get("codesPostaux", [])] or res
        return res[0]["code"] if res else None

    def localiser(self, a):
        """Fixe lat/lon/precision_geo au mieux : parcelle citée > coordonnées source > centre de la commune."""
        a.code_insee = self.code_insee(a)
        ref = None
        if a.ref_cadastrale and len(a.ref_cadastrale) == 14:
            ref = (a.ref_cadastrale[:5], a.ref_cadastrale[5:8], a.ref_cadastrale[8:10], a.ref_cadastrale[10:])
        elif a.code_insee:
            sn = parse_cadastre(a.description)
            if sn:
                ref = (a.code_insee, None, *sn)
        if ref:
            params = {"code_insee": ref[0], "section": ref[2], "numero": ref[3]}
            if ref[1]:
                params["com_abs"] = ref[1]
            fc = self._api(f"{APICARTO}/cadastre/parcelle", params, {"features": []})
            if fc.get("features"):
                f = fc["features"][0]
                c = geo.centroide(f["geometry"])
                if c:
                    a.lat, a.lon = c
                    a.precision_geo = "parcelle"
                    a.ref_cadastrale = f["properties"]["idu"]
                    return f
        if a.lat is not None and a.lon is not None:
            rayon = (a.brut.get("rayon_flou_m") or 0)
            if a.precision_geo is None:
                a.precision_geo = "adresse" if rayon <= 100 else "approx" if rayon <= 500 else "commune"
            return None
        if a.code_insee:
            fc = self._api(f"{APICARTO}/cadastre/commune", {"code_insee": a.code_insee}, {"features": []})
            if not fc.get("features"):  # commune déléguée : pas de contour communal, on prend les feuilles cadastrales
                fc = self._api(f"{APICARTO}/cadastre/division", {"code_insee": a.code_insee}, {"features": []})
            cs = [c for c in (geo.centroide(f["geometry"]) for f in fc.get("features", [])) if c]
            if cs:
                a.lat, a.lon = sum(c[0] for c in cs) / len(cs), sum(c[1] for c in cs) / len(cs)
                a.precision_geo = "commune"
        return None

    # -- urbanisme -------------------------------------------------------------------------------
    def urbanisme(self, lat, lon, precis):
        out = {"zone_plu": None, "type_zone": None, "doc_urbanisme": None, "dist_zone_u_m": None, "dist_zone_au_m": None,
               "prescriptions": [], "servitudes": [], "oap_proche_m": None}
        pt = _point(lat, lon)
        if precis:
            fc = self._api(f"{APICARTO}/gpu/zone-urba", {"geom": pt}, {"features": []})
            if fc.get("features"):
                p = fc["features"][0]["properties"]
                out.update(zone_plu=p.get("libelle"), type_zone=p.get("typezone"),
                           doc_urbanisme=(p.get("idurba") or "").split("_")[1] if "_" in (p.get("idurba") or "") else "PLU")
            else:
                cc = self._api(f"{APICARTO}/gpu/secteur-cc", {"geom": pt}, {"features": []})
                if cc.get("features"):
                    p = cc["features"][0]["properties"]
                    constr = str(p.get("typesect")) in CC_CONSTRUCTIBLE
                    out.update(zone_plu=p.get("libelle") or "Secteur CC", type_zone="U" if constr else "N",
                               doc_urbanisme="CC")
                else:
                    out.update(type_zone="RNU", doc_urbanisme="RNU")
        # Zones constructibles autour (carré de rayon paramétrable)
        rayon = self.cfg["scoring"]["distance_zone_u_max_m"]
        carre = json.dumps(geo.carre_geojson(lat, lon, rayon))
        fc = self._api(f"{APICARTO}/gpu/zone-urba", {"geom": carre}, {"features": []})
        du = dau = None
        for f in fc.get("features", []):
            tz = (f["properties"].get("typezone") or "").upper()
            if tz.startswith("U") or tz.startswith("AU"):
                d = geo.distance_point_geom(lat, lon, f["geometry"])
                if tz.startswith("U"):
                    du = d if du is None else min(du, d)
                else:
                    dau = d if dau is None else min(dau, d)
        if out["doc_urbanisme"] in ("CC", "RNU", None):  # cartes communales : secteurs constructibles (typesect 01/02)
            cc = self._api(f"{APICARTO}/gpu/secteur-cc", {"geom": carre}, {"features": []})
            for f in cc.get("features", []):
                if str(f["properties"].get("typesect")) in CC_CONSTRUCTIBLE:
                    d = geo.distance_point_geom(lat, lon, f["geometry"])
                    du = d if du is None else min(du, d)
        out["dist_zone_u_m"] = round(du) if du is not None else None
        out["dist_zone_au_m"] = round(dau) if dau is not None else None
        if precis:
            fc = self._api(f"{APICARTO}/gpu/prescription-surf", {"geom": pt}, {"features": []})
            out["prescriptions"] = sorted({PSC.get(f["properties"].get("typepsc"), f["properties"].get("libelle") or "")
                                           for f in fc.get("features", []) if f["properties"].get("typepsc") in PSC})
            fc = self._api(f"{APICARTO}/gpu/assiette-sup-s", {"geom": pt}, {"features": []})
            out["servitudes"] = sorted({SUP.get((f["properties"].get("suptype") or "").lower(), (f["properties"].get("suptype") or "").upper())
                                        for f in fc.get("features", [])})
        # OAP à proximité : signal fort de projet d'urbanisation
        fc = self._api(f"{APICARTO}/gpu/prescription-surf", {"geom": json.dumps(geo.carre_geojson(lat, lon, 600))},
                       {"features": []})
        oap = [geo.distance_point_geom(lat, lon, f["geometry"]) for f in fc.get("features", [])
               if f["properties"].get("typepsc") == "18"]
        out["oap_proche_m"] = round(min(oap)) if oap else None
        return out

    def nature(self, lat, lon):
        pt = _point(lat, lon)
        res = {}
        for cle, couches in (("natura2000", ("natura-habitat", "natura-oiseaux")), ("znieff", ("znieff1", "znieff2"))):
            vals = [self._api(f"{APICARTO}/nature/{c}", {"geom": pt}, None) for c in couches]
            res[cle] = None if all(v is None for v in vals) else int(any(v and v.get("features") for v in vals))
        return res

    def risques(self, insee):
        r = self._api(f"{GEORISQUES}/gaspar/risques", {"code_insee": insee}, {"data": []})
        libs = []
        for d in r.get("data", []):
            libs += [x["libelle_risque_long"] for x in d.get("risques_detail", [])]
        ppr = self._api(f"{GEORISQUES}/gaspar/pprn", {"codeInsee": insee}, {"content": []})
        pprs = [p.get("libPpr") for p in ppr.get("content", []) if p.get("modeleProcedure") in ("PPRN-I", "PPRN-Multi")]
        azi = self._api(f"{GEORISQUES}/gaspar/azi", {"code_insee": insee}, {"data": []})
        return {"risques_commune": libs, "ppr_inondation": pprs, "azi": [x.get("libelle_azi") for x in azi.get("data", [])]}

    def acces(self, lat, lon):
        """Distance (m) à la route carrossable publique la plus proche (BD TOPO), dans un rayon de 400 m."""
        s, w, n, e = geo.bbox_autour(lat, lon, 400)
        fc = self._api(WFS, {"SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature",
                             "TYPENAMES": "BDTOPO_V3:troncon_de_route", "outputFormat": "application/json", "COUNT": 500,
                             "BBOX": f"{s},{w},{n},{e},urn:ogc:def:crs:EPSG::4326"}, None)
        if fc is None:
            return None, None
        best = (None, None)
        for f in fc.get("features", []):
            p = f["properties"]
            if p.get("prive") or p.get("etat_de_l_objet") != "En service":
                continue
            if p.get("nature") in ("Sentier", "Escalier", "Piste cyclable", "Bac ou liaison maritime"):
                continue
            d = geo.distance_point_geom(lat, lon, f["geometry"])
            if best[0] is None or d < best[0]:
                best = (round(d), p.get("nature"))
        return best if best[0] is not None else (9999, None)

    def parcelle(self, lat, lon):
        fc = self._api(f"{APICARTO}/cadastre/parcelle", {"geom": _point(lat, lon)}, {"features": []})
        if fc.get("features"):
            p = fc["features"][0]["properties"]
            return {"parcelle_idu": p.get("idu"), "section": p.get("section"), "contenance_m2": p.get("contenance")}
        return {}

    # -- orchestration ---------------------------------------------------------------------------
    def enrichir(self, a, alertes=None):
        self.erreurs = []
        self.localiser(a)
        e = {"annonce_id": a.id, "alertes": alertes or []}
        if a.lat is None:
            e["erreurs"] = self.erreurs + ["localisation impossible"]
            return e
        precis = a.precision_geo in ("parcelle", "adresse", "approx")
        if precis:
            e.update(self.parcelle(a.lat, a.lon))
        e.update(self.urbanisme(a.lat, a.lon, precis))
        if precis:
            e.update(self.nature(a.lat, a.lon))
            e["dist_route_m"], e["nature_route"] = self.acces(a.lat, a.lon)
        if a.code_insee:
            e.update(self.risques(a.code_insee))
            dvf.charger_commune(self.con, self.http, a.code_insee, self.cfg["dvf"]["annees"])
            e["dvf"] = dvf.comparer(self.con, a.code_insee, a.typologie, e.get("section"), self.cfg, a.surface_m2)
        e["dist_littoral_km"] = round(geo.dist_littoral_km(a.lat, a.lon), 1) if a.departement in ("85", "44") else None
        nom, d, w = geo.agglo_proche(a.lat, a.lon)
        e.update(agglo_proche=nom, dist_agglo_km=round(d, 1), poids_agglo=w)
        e["erreurs"] = self.erreurs
        return e


def sauver(con, e):
    d = e.get("dvf") or {}
    con.execute(
        """INSERT OR REPLACE INTO enrichissements (annonce_id, parcelle_idu, section, contenance_m2, zone_plu, type_zone,
           doc_urbanisme, dist_zone_u_m, dist_zone_au_m, natura2000, znieff, ppr_inondation, details_json,
           dist_littoral_km, dist_agglo_km, agglo_proche, dist_route_m, dvf_n, dvf_mediane_m2, dvf_niveau, erreurs, enrichi_le)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (e["annonce_id"], e.get("parcelle_idu"), e.get("section"), e.get("contenance_m2"), e.get("zone_plu"),
         e.get("type_zone"), e.get("doc_urbanisme"), e.get("dist_zone_u_m"), e.get("dist_zone_au_m"), e.get("natura2000"),
         e.get("znieff"), int(bool(e.get("ppr_inondation"))), json.dumps({k: e.get(k) for k in (
             "risques_commune", "ppr_inondation", "azi", "prescriptions", "servitudes", "oap_proche_m", "nature_route",
             "alertes", "poids_agglo", "dvf")}, ensure_ascii=False),
         e.get("dist_littoral_km"), e.get("dist_agglo_km"), e.get("agglo_proche"), e.get("dist_route_m"), d.get("n"),
         d.get("mediane_m2"), d.get("niveau"), json.dumps(e.get("erreurs") or [], ensure_ascii=False), now()))
