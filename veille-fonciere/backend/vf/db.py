import json
import os
import sqlite3
from datetime import datetime, timezone

from .config import BACKEND_DIR, DB_PATH
from .models import Annonce


def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def connect(path=DB_PATH):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    with open(os.path.join(BACKEND_DIR, "schema.sql"), encoding="utf-8") as f:
        con.executescript(f.read())
    # Migration des bases créées avant l'ajout de la colonne adresse
    if "adresse" not in {r[1] for r in con.execute("PRAGMA table_info(notes)")}:
        con.execute("ALTER TABLE notes ADD COLUMN adresse TEXT NOT NULL DEFAULT ''")
    return con


def upsert_annonce(con, a: Annonce, statut="active", motif=None):
    """Insère ou met à jour une annonce. Renvoie True si elle est nouvelle."""
    t = now()
    row = con.execute("SELECT prix, prix_initial, ref_cadastrale, lat, lon, precision_geo FROM annonces WHERE id=?",
                      (a.id,)).fetchone()
    if row is None:
        con.execute(
            """INSERT INTO annonces (id, source, source_id, url, titre, description, prix, surface_m2, departement,
               code_insee, commune, code_postal, lat, lon, precision_geo, ref_cadastrale, typologie, mode_vente,
               photo_url, date_publication, premiere_vue, derniere_vue, prix_initial, statut, motif_exclusion, brut_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (a.id, a.source, a.source_id, a.url, a.titre, a.description, a.prix, a.surface_m2, a.departement,
             a.code_insee, a.commune, a.code_postal, a.lat, a.lon, a.precision_geo, a.ref_cadastrale, a.typologie,
             a.mode_vente, a.photo_url, a.date_publication, t, t, a.prix, statut, motif,
             json.dumps(a.brut, ensure_ascii=False, default=str)))
        if a.prix:
            con.execute("INSERT OR IGNORE INTO prix_historique VALUES (?,?,?)", (a.id, t[:10], a.prix))
        return True
    # Une localisation saisie à la main (parcelle) n'est jamais écrasée par une collecte
    garde_loc = row["precision_geo"] == "parcelle" and a.precision_geo != "parcelle"
    con.execute(
        """UPDATE annonces SET url=?, titre=?, description=?, prix=?, surface_m2=?, code_insee=COALESCE(?, code_insee),
           commune=COALESCE(?, commune), code_postal=COALESCE(?, code_postal), lat=?, lon=?, precision_geo=?,
           ref_cadastrale=COALESCE(?, ref_cadastrale), typologie=?, mode_vente=?, photo_url=?, derniere_vue=?,
           statut=?, motif_exclusion=?, brut_json=? WHERE id=?""",
        (a.url, a.titre, a.description, a.prix, a.surface_m2, a.code_insee, a.commune, a.code_postal,
         row["lat"] if garde_loc else a.lat, row["lon"] if garde_loc else a.lon,
         row["precision_geo"] if garde_loc else a.precision_geo, a.ref_cadastrale, a.typologie, a.mode_vente,
         a.photo_url, t, statut, motif, json.dumps(a.brut, ensure_ascii=False, default=str), a.id))
    if a.prix and row["prix"] != a.prix:
        con.execute("INSERT OR REPLACE INTO prix_historique VALUES (?,?,?)", (a.id, t[:10], a.prix))
    return False


def annonce_from_row(r) -> Annonce:
    return Annonce(
        source=r["source"], source_id=r["source_id"], url=r["url"], departement=r["departement"],
        titre=r["titre"] or "", description=r["description"] or "", prix=r["prix"], surface_m2=r["surface_m2"],
        code_insee=r["code_insee"], commune=r["commune"], code_postal=r["code_postal"], lat=r["lat"], lon=r["lon"],
        precision_geo=r["precision_geo"], ref_cadastrale=r["ref_cadastrale"], typologie=r["typologie"],
        mode_vente=r["mode_vente"], photo_url=r["photo_url"], date_publication=r["date_publication"])


def save_note(con, annonce_id, texte=None, suivi=None, favori=None, adresse=None):
    cur = con.execute("SELECT texte, suivi, favori, adresse FROM notes WHERE annonce_id=?", (annonce_id,)).fetchone()
    texte = texte if texte is not None else (cur["texte"] if cur else "")
    suivi = suivi if suivi is not None else (cur["suivi"] if cur else "")
    favori = int(favori) if favori is not None else (cur["favori"] if cur else 0)
    adresse = adresse if adresse is not None else (cur["adresse"] if cur else "")
    con.execute("INSERT OR REPLACE INTO notes (annonce_id, texte, adresse, suivi, favori, maj_le) VALUES (?,?,?,?,?,?)",
                (annonce_id, texte, adresse, suivi, favori, now()))
    con.commit()
    return {"annonce_id": annonce_id, "texte": texte, "adresse": adresse, "suivi": suivi, "favori": bool(favori)}
