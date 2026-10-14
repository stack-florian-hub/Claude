"""Génère la page autonome publiée comme artefact claude.ai à partir de l'export JSON du backend.

Usage : python3 build_artifact.py [export.json] [sortie.html]
Les images et tuiles externes étant bloquées dans un artefact, la carte utilise les contours des départements
embarqués (departements.json) et les photos sont omises.
"""
import json
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ICI, "..", "frontend", "public", "data", "opportunites.json")
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ICI, "veille-fonciere.html")

d = json.load(open(src, encoding="utf-8"))
for a in d["annonces"]:
    a.pop("photo_url", None)
    a["description"] = (a.get("description") or "")[:1800]
    if a.get("dvf") and a["dvf"].get("ventes"):
        a["dvf"]["ventes"] = [{k: v[k] for k in ("date", "valeur", "surface_m2", "prix_m2", "nature", "section")} for v in a["dvf"]["ventes"][:8]]


def js(obj):
    # JSON sûr dans une balise <script> : on neutralise « </ » et les séparateurs de ligne Unicode
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


html = open(os.path.join(ICI, "template.html"), encoding="utf-8").read()
deps = json.load(open(os.path.join(ICI, "departements.json"), encoding="utf-8"))
leaflet_css = open(os.path.join(ICI, "leaflet.css"), encoding="utf-8").read()
html = html.replace("__LEAFLET_CSS__", leaflet_css).replace("__DATA__", js(d)).replace("__DEPS__", js(deps))
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print(f"{out} ({len(html) // 1024} Ko, {len(d['annonces'])} terrains)")
