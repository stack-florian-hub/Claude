"""Prépare l'import des adjudications collectées par licitor_tj.py dans la collection resultats.
Usage : python3 import_resultats.py licitor_tj.json ids_existants.txt OUT_DIR
Écrit un fichier JSON par document et OUT_DIR/plan.json (lots de 50 écritures « set » sur des documents nouveaux)."""
import json, os, sys

src, ids_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(src))
existing = set(open(ids_path).read().split()) if os.path.exists(ids_path) else set()
clean = lambda d: {k: v for k, v in d.items() if v not in (None, "")}
os.makedirs(out, exist_ok=True)
writes, seen, stats = [], set(), {"inconnu": 0, "multi": 0, "carence": 0, "deja": 0}
for r in data["resultats"]:
    if r["ref"] in seen:
        continue
    seen.add(r["ref"])
    did = "lic-" + r["ref"]
    if did in existing:
        stats["deja"] += 1; continue
    if r.get("lots", 1) > 1:
        stats["multi"] += 1; continue
    if not r.get("adjuge") and not r.get("carence"):
        stats["inconnu"] += 1; continue
    if r.get("carence"):
        stats["carence"] += 1
    doc = clean({"date": (r.get("date") or r.get("audience_page") or "")[:10], "tribunal": r["tribunal"], "commune": r.get("commune"),
                 "dept": r.get("dept"), "type": r.get("type"), "surface": r.get("surface"), "map": r.get("map"),
                 "adjuge": r.get("adjuge"), "carence": "oui" if r.get("carence") else None, "occupation": r.get("occupation"),
                 "baisse": r.get("baisse"), "surenchere": "non", "source": "Licitor (calendrier du TJ)", "lien": r.get("lien"),
                 "verifie": "oui", "notes": (r.get("description") or "")[:300]})
    p = os.path.join(out, did + ".json")
    json.dump(doc, open(p, "w"), ensure_ascii=False)
    writes.append({"op": "set", "collection": "resultats", "doc_id": did, "file_path": os.path.abspath(p)})
json.dump([writes[i:i + 50] for i in range(0, len(writes), 50)], open(os.path.join(out, "plan.json"), "w"), indent=0)
print(len(writes), "nouveaux résultats", stats, (len(writes) + 49) // 50, "lots d'écriture")
