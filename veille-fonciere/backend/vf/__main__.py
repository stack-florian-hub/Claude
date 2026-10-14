"""Ligne de commande : python -m vf <commande>.

  init                          crée la base SQLite
  collecter [-s notaires,bienici] [-d 85,44]
  importer fichier.csv|json     annonces saisies à la main / autres sites
  requalifier                   réapplique les filtres de config.json
  enrichir [--tout] [--id ID]   cadastre, PLU, risques, DVF (nouvelles annonces par défaut)
  scorer
  exporter [-o chemin.json]     JSON lu par le dashboard
  tout [-s ...] [-d ...]        collecter + enrichir + scorer + exporter
  localiser ID IDU              fixe la parcelle (ex. 85147000ZK0123) puis ré-enrichit
  serve [-p 8765]               API locale (notes) + dashboard compilé
"""
import argparse
import logging

from . import pipeline
from .config import DB_PATH, EXPORT_PATH, load_config
from .db import connect
from .http import Http


def main(argv=None):
    p = argparse.ArgumentParser(prog="vf", description="Veille foncière 85/44/49/37")
    p.add_argument("-v", "--verbose", action="store_true")
    p.add_argument("--config")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init")
    for nom in ("collecter", "tout"):
        sp = sub.add_parser(nom)
        sp.add_argument("-s", "--sources", help="liste séparée par des virgules")
        sp.add_argument("-d", "--deps", help="ex. 85,44")
    sp = sub.add_parser("importer")
    sp.add_argument("fichier")
    sub.add_parser("requalifier")
    sp = sub.add_parser("enrichir")
    sp.add_argument("--tout", action="store_true", help="ré-enrichir aussi les annonces déjà traitées")
    sp.add_argument("--id", action="append")
    sub.add_parser("scorer")
    sp = sub.add_parser("exporter")
    sp.add_argument("-o", "--out", default=EXPORT_PATH)
    sp = sub.add_parser("localiser")
    sp.add_argument("id")
    sp.add_argument("idu")
    sp = sub.add_parser("serve")
    sp.add_argument("-p", "--port", type=int, default=8765)
    a = p.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO, format="%(asctime)s %(name)s %(message)s",
                        datefmt="%H:%M:%S")
    cfg = load_config(a.config)
    con = connect(DB_PATH)
    http = Http(cfg)
    split = lambda s: [x.strip() for x in s.split(",")] if s else None
    try:
        if a.cmd == "init":
            print(f"Base prête : {DB_PATH}")
        elif a.cmd in ("collecter", "tout"):
            pipeline.collecter(con, http, cfg, split(a.sources), split(a.deps))
            if a.cmd == "tout":
                pipeline.enrichir(con, http, cfg)
                pipeline.scorer(con, cfg)
                print(f"{pipeline.exporter(con, EXPORT_PATH)} opportunités exportées vers {EXPORT_PATH}")
        elif a.cmd == "importer":
            print(f"{pipeline.importer(con, cfg, a.fichier)} lignes lues")
        elif a.cmd == "requalifier":
            print(f"{pipeline.requalifier(con, cfg)} annonces requalifiées")
        elif a.cmd == "enrichir":
            print(f"{pipeline.enrichir(con, http, cfg, a.tout, a.id)} annonces enrichies")
        elif a.cmd == "scorer":
            print(f"{pipeline.scorer(con, cfg)} annonces scorées")
        elif a.cmd == "exporter":
            print(f"{pipeline.exporter(con, a.out)} opportunités exportées vers {a.out}")
        elif a.cmd == "localiser":
            pipeline.localiser(con, a.id, a.idu)
            pipeline.enrichir(con, http, cfg, ids=[a.id])
            pipeline.scorer(con, cfg)
            pipeline.exporter(con, EXPORT_PATH)
            print("Parcelle enregistrée, annonce ré-enrichie et export mis à jour.")
        elif a.cmd == "serve":
            from .server import serve
            serve(con, a.port)
    finally:
        http.close()


if __name__ == "__main__":
    main()
