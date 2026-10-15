"""Mini-serveur local (bibliothèque standard) : sert le dashboard compilé et persiste les notes dans SQLite.

  GET  /api/opportunites     export JSON courant
  GET  /api/notes            toutes les notes
  PUT  /api/notes/<id>       {"texte": "...", "suivi": "visite", "favori": true}
"""
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import unquote

from .config import BACKEND_DIR, EXPORT_PATH
from .db import save_note

DIST = os.path.join(BACKEND_DIR, "..", "frontend", "dist")


def serve(con, port=8765):
    class H(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=DIST if os.path.isdir(DIST) else None, **kw)

        def _json(self, obj, code=200):
            body = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self):
            if self.path.startswith("/api/opportunites") or self.path.startswith("/data/opportunites.json"):
                with open(EXPORT_PATH, encoding="utf-8") as f:
                    return self._json(json.load(f))
            if self.path.startswith("/api/notes"):
                rows = con.execute("SELECT * FROM notes").fetchall()
                return self._json({r["annonce_id"]: {"texte": r["texte"], "adresse": r["adresse"], "suivi": r["suivi"], "favori": bool(r["favori"]),
                                                     "maj_le": r["maj_le"]} for r in rows})
            return super().do_GET()

        def do_PUT(self):
            if not self.path.startswith("/api/notes/"):
                return self._json({"erreur": "inconnu"}, 404)
            aid = unquote(self.path[len("/api/notes/"):])
            n = int(self.headers.get("Content-Length") or 0)
            d = json.loads(self.rfile.read(n) or b"{}")
            return self._json(save_note(con, aid, d.get("texte"), d.get("suivi"), d.get("favori"), d.get("adresse")))

    print(f"Dashboard : http://localhost:{port}  (API : /api/opportunites, /api/notes)")
    HTTPServer(("127.0.0.1", port), H).serve_forever()  # mono-thread : la connexion SQLite est partagée
