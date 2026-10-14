from .api import BienIci, Notaires
from .sites import SITES, ImportManuel

COLLECTEURS = {"notaires": Notaires, "bienici": BienIci, **SITES}

__all__ = ["COLLECTEURS", "ImportManuel"]
