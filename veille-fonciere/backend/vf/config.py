import json
import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("VF_DATA_DIR", os.path.join(BACKEND_DIR, "data"))
CACHE_DIR = os.path.join(DATA_DIR, "cache")
DB_PATH = os.environ.get("VF_DB", os.path.join(DATA_DIR, "veille.sqlite"))
EXPORT_PATH = os.environ.get(
    "VF_EXPORT", os.path.join(BACKEND_DIR, "..", "frontend", "public", "data", "opportunites.json"))


def load_config(path=None):
    path = path or os.environ.get("VF_CONFIG", os.path.join(BACKEND_DIR, "config.json"))
    with open(path, encoding="utf-8") as f:
        return json.load(f)
