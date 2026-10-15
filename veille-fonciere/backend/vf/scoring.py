"""Score d'opportunité sur 100 = décote DVF (30) + potentiel de mutation PLU (35) + accessibilité/usage (20) + rareté (15).

Chaque composante est d'abord un facteur 0..1, multiplié par son poids (config.json > scoring.poids).
Toutes les règles produisent une phrase d'explication, affichée dans la fiche du terrain.
"""


def _interp(x, pts):
    """Interpolation linéaire sur une liste de (x, y) triée par x."""
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


def _codes(e):
    return {a["code"] for a in e.get("alertes") or []}


def decote(a, e, why):
    d = e.get("dvf") or {}
    med = d.get("mediane_m2")
    if not a.surface_m2 or not med:
        why.append("Décote : surface ou référence DVF inconnue, facteur neutre.")
        return 0.35
    r = (a.prix / a.surface_m2) / med
    f = _interp(r, [(0.25, 1.0), (1.0, 0.5), (1.75, 0.0)])
    niveau = d.get("niveau")
    lib = {"section": "même section cadastrale", "commune": "commune", "departement": "département",
           "repere_regional": "repère régional (peu de ventes locales)"}.get(niveau, niveau)
    why.append(f"Décote : {a.prix / a.surface_m2:.2f} €/m² contre une médiane DVF de {med:.2f} €/m² "
               f"({lib}, {d.get('n', 0)} ventes) soit {r * 100:.0f} % du marché.")
    if niveau == "repere_regional":
        f *= 0.8
    return f


def mutation(a, e, cfg, why):
    if "zone_rouge" in _codes(e):
        why.append("Mutation : zone rouge d'un plan de prévention des risques annoncée, inconstructibilité durable.")
        return 0.0
    f = _mutation_brute(a, e, cfg, why)
    return _freins_texte(e, f, why)


def _freins_texte(e, f, why):
    """Indices de l'annonce qui rendent un passage en zone constructible très improbable."""
    codes = _codes(e)
    freins = []
    if "inondable" in codes:
        f *= 0.3
        freins.append("zone inondable signalée par l'annonce")
    elif "bord_eau" in codes and (e.get("ppr_inondation") or e.get("azi")):
        f *= 0.3
        freins.append("bord de cours d'eau dans une commune couverte par un PPRi / atlas des zones inondables")
    if freins:
        why.append("Mutation freinée : " + ", ".join(freins) + ".")
    return f


def _mutation_brute(a, e, cfg, why):
    precis = a.precision_geo in ("parcelle", "adresse", "approx")
    tz = (e.get("type_zone") or "").upper()
    if not precis:
        za = next((x.get("zone") for x in e.get("alertes") or [] if x.get("code") == "zone_annoncee"), None)
        if za and za[:1] in ("N", "A") and not za.startswith("AU"):
            why.append(f"Mutation : zone {za} annoncée par le vendeur, position connue à la commune seulement (distance aux zones constructibles inconnue).")
            return 0.15 if za.startswith("N") else 0.2
        if za and (za.startswith("U") or za.startswith("AU")):
            why.append(f"Mutation : zone {za} annoncée par le vendeur (à vérifier sur le Géoportail de l'urbanisme).")
            return 0.4 if a.typologie == "constructible" else 0.7
        why.append("Mutation : position connue à la commune seulement, facteur neutre (localiser la parcelle pour affiner).")
        return 0.3
    za = next((x.get("zone") for x in e.get("alertes") or [] if x.get("code") == "zone_annoncee"), None)
    annonce_non_constr = "non_constructible" in _codes(e) or (za and za[:1] in ("N", "A") and not za.startswith("AU"))
    if tz.startswith("U") and annonce_non_constr and a.precision_geo != "parcelle":
        # Le point (approximatif) tombe en zone U mais l'annonce dit le contraire : le terrain est en bordure de zone U
        why.append(f"Mutation : le point approché tombe en zone {e.get('zone_plu') or 'U'}, mais l'annonce indique "
                   f"{'une zone ' + za if za else 'un terrain non constructible'} : terrain probablement en limite de zone urbanisée.")
        return _flou(a, 0.6 * (0.85 if (za or "").startswith("N") else 1.0), why)
    if tz.startswith("U"):
        if a.typologie == "constructible":
            why.append(f"Mutation : déjà en zone {e.get('zone_plu') or 'U'} et vendu comme constructible — plus-value d'urbanisation déjà dans le prix.")
            return _flou(a, 0.4, why)
        why.append(f"Mutation : en zone {e.get('zone_plu') or 'U'} (constructible) mais vendu comme {a.typologie} — à vérifier au règlement.")
        return _flou(a, 1.0, why)
    if tz.startswith("AU"):
        f = 0.95 if tz == "AUC" else 0.8
        why.append(f"Mutation : zone à urbaniser {e.get('zone_plu')} ({'ouverte' if tz == 'AUC' else 'fermée, ouverture par modification du PLU'}).")
        return _flou(a, f, why)
    c = cfg["scoring"]
    ideal, dmax = c["distance_zone_u_ideale_m"], c["distance_zone_u_max_m"]
    courbe = [(ideal, 1.0), (200, 0.7), (500, 0.4), (dmax, 0.0)]
    du, dau = e.get("dist_zone_u_m"), e.get("dist_zone_au_m")
    f = 0.0
    if du is not None:
        f = _interp(du, courbe)
    if dau is not None:
        f = max(f, min(1.0, _interp(dau, courbe) * 1.05))
    if du is None and dau is None:
        if tz == "RNU":
            why.append("Mutation : commune au RNU (pas de PLU) — constructibilité limitée aux parties urbanisées.")
            return 0.25
        why.append(f"Mutation : aucune zone U/AU à moins de {dmax} m.")
        return 0.0
    plus_proche = min(x for x in (du, dau) if x is not None)
    why.append(f"Mutation : zone {e.get('zone_plu') or tz or '?'} à {plus_proche:.0f} m de la zone constructible la plus proche"
               f"{' (zone AU)' if dau is not None and dau == plus_proche else ''}.")
    if tz.startswith("N"):
        f *= 0.85
    if e.get("oap_proche_m") is not None:
        f = min(1.0, f + 0.1)
        why.append(f"Mutation : OAP (projet d'aménagement) à {e['oap_proche_m']} m.")
    freins = []
    psc = " ".join(e.get("prescriptions") or [])
    for mot, k, lib in (("EBC", 0.5, "espace boisé classé"), ("humide", 0.5, "zone humide"),
                        ("non aedificandi", 0.3, "zone non aedificandi")):
        if mot in psc:
            f *= k
            freins.append(lib)
    if e.get("natura2000"):
        f *= 0.6
        freins.append("Natura 2000")
    if any("PPR naturel" in s for s in e.get("servitudes") or []):
        f *= 0.4
        freins.append("dans un périmètre de PPR")
    lit = e.get("dist_littoral_km")
    if lit is not None and lit < 1.5:
        f *= 0.0 if lit < 0.1 else 0.6
        freins.append("loi Littoral (espaces proches du rivage)")
    if freins:
        why.append("Mutation freinée : " + ", ".join(freins) + ".")
    return _flou(a, f, why)


def _flou(a, f, why):
    """Position approximative (annonce géolocalisée à quelques centaines de mètres) : on tire le facteur vers le neutre."""
    if a.precision_geo == "approx":
        why.append("Mutation : position approximative (rayon de quelques centaines de mètres), facteur atténué.")
        return 0.6 * f + 0.4 * 0.3
    return f


def acces(a, e, why):
    pts = 0.0
    codes = _codes(e)
    dr = e.get("dist_route_m")
    if dr is None:
        pts += 4
        why.append("Accès : distance à la voie inconnue.")
    else:
        p = 8 if dr <= 15 else 6 if dr <= 50 else 3 if dr <= 150 else 0
        pts += p
        why.append(f"Accès : voie publique ({(e.get('nature_route') or 'route').lower()}) à {dr:.0f} m." if dr < 9999 else "Accès : aucune route à moins de 400 m.")
    du = e.get("dist_zone_u_m")
    if "viabilise" in codes or (du is not None and du <= 100):
        pts += 5
        why.append("Usage : réseaux probablement à proximité (zone urbanisée ≤ 100 m ou annonce).")
    elif du is not None and du <= 300:
        pts += 3
    else:
        pts += 1 if du is not None else 2
    contraintes = 7.0
    motifs = []
    if any("PPR naturel" in s for s in e.get("servitudes") or []):
        contraintes -= 5
        motifs.append("périmètre PPR au point")
    elif e.get("ppr_inondation"):
        contraintes -= 1
        motifs.append("PPRi sur la commune")
    if "zone_rouge" in codes:
        contraintes -= 5
        motifs.append("zone rouge de PPR")
    if "bord_eau" in codes and "inondable" not in codes and (e.get("ppr_inondation") or e.get("azi")):
        contraintes -= 3
        motifs.append("bord de cours d'eau en commune à PPRi")
    if "inondable" in codes or any("inondable" in p.lower() for p in e.get("prescriptions") or []):
        contraintes -= 3
        motifs.append("zone inondable mentionnée")
    if "enclave" in codes or "acces_pied" in codes:
        contraintes -= 4
        motifs.append("accès à pied uniquement" if "acces_pied" in codes else "risque d'enclavement")
    if any("humide" in p for p in e.get("prescriptions") or []):
        contraintes -= 3
        motifs.append("zone humide")
    if "ligne_ht" in codes or any("électrique" in s for s in e.get("servitudes") or []):
        contraintes -= 1
        motifs.append("ligne électrique")
    if "bail_rural" in codes:
        contraintes -= 2
        motifs.append("bail rural en cours")
    if e.get("natura2000"):
        contraintes -= 2
        motifs.append("Natura 2000")
    if motifs:
        why.append("Contraintes : " + ", ".join(motifs) + ".")
    pts += max(0.0, contraintes)
    return min(20.0, pts) / 20


def rarete(a, e, cfg, why):
    c = cfg["scoring"]
    L = 0.0
    lit = e.get("dist_littoral_km")
    if lit is not None:
        L = _interp(lit, [(2, 10), (5, 8), (15, 5), (c["littoral_km_max"], 1.5), (c["littoral_km_max"] + 0.01, 0)])
        if lit <= c["littoral_km_max"]:
            why.append(f"Rareté : littoral à {lit:.0f} km.")
    A = 0.0
    if e.get("dist_agglo_km") is not None:
        d_eff = e["dist_agglo_km"] / (e.get("poids_agglo") or 1)
        A = _interp(d_eff, [(8, 10), (20, 6), (35, 3), (c["agglo_km_max"] + 10, 0)])
        why.append(f"Rareté : {e['agglo_proche']} à {e['dist_agglo_km']:.0f} km.")
    return min(1.0, (max(L, A) + 0.5 * min(L, A)) / 10)


def scorer(a, e, cfg):
    p = cfg["scoring"]["poids"]
    why = []
    f_dec = decote(a, e, why)
    f_mut = mutation(a, e, cfg, why)
    f_acc = acces(a, e, why)
    f_rar = rarete(a, e, cfg, why)
    s = {"s_decote": round(f_dec * p["decote"], 1), "s_mutation": round(f_mut * p["mutation"], 1),
         "s_acces": round(f_acc * p["acces"], 1), "s_rarete": round(f_rar * p["rarete"], 1)}
    s["score"] = round(sum(s.values()), 1)
    niveau_dvf = (e.get("dvf") or {}).get("niveau")
    if a.precision_geo == "commune" or not a.surface_m2:
        conf = "faible"
    elif a.precision_geo in ("parcelle", "adresse") and niveau_dvf in ("section", "commune") and not e.get("erreurs"):
        conf = "haute"
    else:
        conf = "moyenne"
    s["confiance"] = conf
    s["explications"] = why
    return s
