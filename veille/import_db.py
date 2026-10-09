"""Transforme la sortie de licitor.py en documents pour la base de la tour de contrôle.
Usage : python3 import_db.py licitor.json lots_existants.json OUT_DIR
Écrit un fichier JSON par document et un plan de lots (batches de 50) dans OUT_DIR/plan.json."""
import geo, json, os, re, sys, unicodedata

src, existing_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
vench = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else []
ZONE = {"Nantes", "Saint-Nazaire", "La Roche-sur-Yon", "Les Sables-d'Olonne", "Angers", "Saumur", "Tours", "Blois", "Le Mans", "Laval", "Poitiers", "Orléans", "Châteauroux", "Montargis"}
data = json.load(open(src))
existing = json.load(open(existing_path)) if os.path.exists(existing_path) else {}
MAP_MAX = 40000
TRIB = {"nantes": "Nantes", "saint-nazaire": "Saint-Nazaire", "saint nazaire": "Saint-Nazaire", "la roche-sur-yon": "La Roche-sur-Yon", "les sables-d'olonne": "Les Sables-d'Olonne",
        "angers": "Angers", "saumur": "Saumur", "tours": "Tours", "blois": "Blois", "le mans": "Le Mans", "laval": "Laval",
        "poitiers": "Poitiers", "orleans": "Orléans", "chateauroux": "Châteauroux", "montargis": "Montargis"}

def ascii_(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()

def trib(t):
    a = ascii_(t).replace(" sur ", "-sur-").replace("sables d'olonne", "sables-d'olonne")
    return TRIB.get(a, t.strip())

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", ascii_(s)).strip("-")[:40]

MOIS = {m: i + 1 for i, m in enumerate("janvier février mars avril mai juin juillet août septembre octobre novembre décembre".split())}
def visite(txt):
    """Toutes les dates de visite du texte ; renvoie la prochaine à venir, sinon la dernière."""
    import datetime
    ds = []
    for m in re.finditer(r"(\d{1,2})(?:er)? (\w+) (\d{4})(?: (?:de|à) (\d{1,2})h(\d{2})?)?", txt or ""):
        if m.group(2) in MOIS:
            ds.append(f"{m.group(3)}-{MOIS[m.group(2)]:02d}-{int(m.group(1)):02d}" + (f"T{int(m.group(4)):02d}:{m.group(5) or '00'}" if m.group(4) else ""))
    if not ds:
        return None
    now = datetime.datetime.now().isoformat(timespec="minutes")
    return next((d for d in sorted(ds) if d >= now), sorted(ds)[-1])

def clean(d):
    return {k: v for k, v in d.items() if v not in (None, "")}

docs, rseen = [], set()
for r in data["resultats"]:
    if r["ref"] in rseen:
        continue
    rseen.add(r["ref"])
    if not r.get("adjuge") or not r.get("map") or r.get("lots", 1) > 1 or trib(r["tribunal"]) not in ZONE:
        continue
    docs.append(("resultats", "lic-" + r["ref"], clean({
        "date": r["date"][:10], "tribunal": trib(r["tribunal"]), "commune": r["commune"], "dept": r["dept"], "type": r["type"],
        "surface": r["surface"], "map": r["map"], "adjuge": r["adjuge"], "occupation": r["occupation"], "baisse": r["baisse"],
        "surenchere": "non", "source": "Licitor", "lien": r["lien"], "verifie": "oui", "notes": r["description"][:300]})))

new_lots, updates = [], []
def pos(commune, dept, tribunal):
    """Centre de la commune pour l'onglet Carte (vide si introuvable)."""
    try:
        c = geo.centre(commune, dept, tribunal)
    except Exception:
        c = None
    return {"lat": c[0], "lon": c[1], "geoPrecision": "commune"} if c else {}

def key(commune, m):
    return (ascii_(re.sub(r"\s*\(.*", "", commune or ""))[:12], m)
seen_ex = {key(v["data"].get("commune"), v["data"].get("map")) for v in existing.values()}
done = set()
for r in data["avenir"]:
    ref = r["ref"]
    if ref in done:
        continue
    done.add(ref)
    if ref in existing:
        cur = existing[ref]["data"]
        ch = {}
        if r.get("map") and r["map"] != cur.get("map"):
            ch["map"] = r["map"]
        if r.get("date") and cur.get("audience") and r["date"][:10] != str(cur["audience"])[:10]:
            ch["audience"] = r["date"]
        if ch and cur.get("statut") not in ("plafond", "enchere", "gagne", "revendu"):
            updates.append((ref, existing[ref]["version"], ch, cur))
        continue
    if not r.get("map") or r["map"] > MAP_MAX or trib(r["tribunal"]) not in ZONE or key(r["commune"], r["map"]) in seen_ex:
        continue
    new_lots.append(("lots", ref, clean({
        "ref": ref, "titre": (r["titre"][:1].upper() + r["titre"][1:] + " " + r["commune"]).strip(), "commune": f"{r['commune']} ({r['dept']})",
        "type": r["type"], "tribunal": trib(r["tribunal"]), "audience": r["date"], "map": r["map"], "surface": r["surface"],
        "occupation": r["occupation"], "poursuivant": r["poursuivant"], "lien": r["lien"], "statut": "repere", "visite": visite(r.get("visite_txt")), "visitesTxt": r.get("visite_txt"), "adresse": r.get("adresse"),
        "notes": (r["description"] + (" | " + r["visite_txt"] if r.get("visite_txt") else ""))[:500], **pos(r["commune"], r["dept"], None)})))

seen = {key(v["data"].get("commune"), v["data"].get("map")) for v in existing.values()}
seen |= {key(b["commune"], b["map"]) for _, _, b in new_lots}
seen |= {key(r["commune"], r.get("map")) for r in data["avenir"]}
for v in vench:
    if not v.get("map") or v["map"] > MAP_MAX or not v.get("ref") or key(v["commune"], v["map"]) in seen or v["ref"] in existing:
        continue
    seen.add(key(v["commune"], v["map"]))
    new_lots.append(("lots", v["ref"], clean({
        "ref": v["ref"], "titre": f'{v["titre"]} {v["commune"]}', "commune": v["commune"], "type": v["type"], "tribunal": v["tribunal"],
        "audience": v["audience"], "visite": v.get("visite"), "map": v["map"], "surface": v.get("surface"), "occupation": "inconnu",
        **pos(v["commune"], None, v["tribunal"]),
        "lien": v.get("lien"), "statut": "repere", "notes": "Source vench.fr (liste publique ; détail réservé aux abonnés). Cahier des conditions de vente à demander à l'avocat poursuivant."})))

os.makedirs(out, exist_ok=True)
writes = []
for col, did, body in docs + new_lots:
    p = os.path.join(out, f"{col}-{did}.json")
    json.dump(body, open(p, "w"), ensure_ascii=False)
    writes.append({"op": "set", "collection": col, "doc_id": did, "file_path": p})
for ref, ver, ch, cur in updates:
    p = os.path.join(out, f"upd-{ref}.json")
    json.dump(ch, open(p, "w"), ensure_ascii=False)
    writes.append({"op": "update", "collection": "lots", "doc_id": ref, "file_path": p, "if_version": ver})
json.dump([writes[i:i + 50] for i in range(0, len(writes), 50)], open(os.path.join(out, "plan.json"), "w"), indent=0)
print(len(docs), "résultats,", len(new_lots), "nouveaux lots,", len(updates), "mises à jour,", (len(writes) + 49) // 50, "lots d'écriture")
for ref, ver, ch, cur in updates:
    print("  MAJ", ref, cur.get("titre"), ch)
for _, did, b in new_lots:
    print("  NOUVEAU", did, b["titre"], b.get("tribunal"), b.get("audience"), b["map"])
