"""Accès réseau « poli » : délai par domaine, respect de robots.txt, cache disque, rendu JS optionnel.

Aucun contournement de protection anti-robot n'est implémenté : si un site renvoie un CAPTCHA ou un 403,
la source est ignorée (ou passée en mode navigateur visible, où c'est vous qui naviguez).
"""
import hashlib
import json
import logging
import os
import time
import urllib.robotparser
from urllib.parse import urlparse

import requests

from .config import CACHE_DIR

log = logging.getLogger("vf.http")


class Bloque(Exception):
    """Le site refuse l'accès automatisé (403, CAPTCHA, robots.txt)."""


class Http:
    def __init__(self, cfg):
        c = cfg.get("collecte", {})
        self.delai = float(c.get("delai_entre_requetes_s", 3))
        self.delai_api = float(c.get("delai_api_s", 0.3))
        self.robots = bool(c.get("respecter_robots_txt", True))
        self.visible = bool(c.get("navigateur_visible", True))
        self.ua = c.get("user_agent", "VeilleFonciere/1.0")
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": self.ua, "Accept-Language": "fr-FR,fr;q=0.9"})
        self._dernier = {}
        self._robots = {}
        self._pw = None

    # -- règles de politesse -------------------------------------------------
    def _attendre(self, host, delai=None):
        delai = self.delai if delai is None else delai
        dt = time.monotonic() - self._dernier.get(host, 0)
        if dt < delai:
            time.sleep(delai - dt)
        self._dernier[host] = time.monotonic()

    def autorise(self, url):
        if not self.robots:
            return True
        p = urlparse(url)
        base = f"{p.scheme}://{p.netloc}"
        if base not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self.s.get(base + "/robots.txt", timeout=15)
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            except requests.RequestException:
                rp.parse([])
            self._robots[base] = rp
        return self._robots[base].can_fetch(self.ua, url)

    # -- requêtes --------------------------------------------------------------
    def get(self, url, params=None, api=False, **kw):
        """GET avec délai. `api=True` : endpoint JSON public, pas de contrôle robots.txt (open data, API)."""
        if not api and not self.autorise(url):
            raise Bloque(f"robots.txt interdit {url}")
        timeout = kw.pop("timeout", 30)
        for essai in range(3):  # coupures réseau ponctuelles des API publiques
            self._attendre(urlparse(url).netloc, self.delai_api if api else None)
            try:
                r = self.s.get(url, params=params, timeout=timeout, **kw)
                break
            except (requests.ConnectionError, requests.Timeout):
                if essai == 2:
                    raise
                time.sleep(2 * (essai + 1))
        if r.status_code in (403, 429) or "captcha" in r.text[:3000].lower():
            raise Bloque(f"{r.status_code} sur {url}")
        r.raise_for_status()
        return r

    def get_json(self, url, params=None, ttl_h=24 * 7, api=True):
        """GET JSON avec cache disque (les API open data sont lentes et rate-limitées)."""
        key = hashlib.sha1((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()
        path = os.path.join(CACHE_DIR, "http", key[:2], key + ".json")
        if os.path.exists(path) and time.time() - os.path.getmtime(path) < ttl_h * 3600:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        data = self.get(url, params=params, api=api).json()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        return data

    def get_text_cache(self, url, ttl_h=24 * 30):
        """Gros fichiers open data (DVF) : cache disque long. Renvoie None si 404."""
        key = hashlib.sha1(url.encode()).hexdigest()
        path = os.path.join(CACHE_DIR, "files", key[:2], key)
        if os.path.exists(path) and time.time() - os.path.getmtime(path) < ttl_h * 3600:
            with open(path, encoding="utf-8") as f:
                txt = f.read()
            return txt or None
        self._attendre(urlparse(url).netloc, self.delai_api)
        r = self.s.get(url, timeout=60)
        txt = r.text if r.status_code == 200 else ""
        if r.status_code not in (200, 404):
            r.raise_for_status()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(txt)
        return txt or None

    # -- rendu JavaScript (Playwright, optionnel) ----------------------------------
    def rendu(self, url, attendre_selecteur=None, scroll=2):
        """Ouvre la page dans Chromium et renvoie le HTML rendu.

        En mode `navigateur_visible`, la fenêtre s'affiche : si le site demande une vérification humaine,
        c'est à vous de la faire ; la collecte reprend ensuite (jusqu'à 3 minutes d'attente).
        """
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as e:
            raise Bloque("Playwright non installé (pip install playwright && playwright install chromium)") from e
        if self._pw is None:
            self._pw_ctx = sync_playwright().start()
            exe = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
            self._browser = self._pw_ctx.chromium.launch(headless=not self.visible, executable_path=exe)
            self._pw = self._browser.new_context(locale="fr-FR")
        self._attendre(urlparse(url).netloc)
        page = self._pw.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            if attendre_selecteur:
                page.wait_for_selector(attendre_selecteur, timeout=180000 if self.visible else 20000)
            for _ in range(scroll):
                page.mouse.wheel(0, 4000)
                page.wait_for_timeout(800)
            return page.content()
        except Exception as e:  # timeout, CAPTCHA non résolu...
            raise Bloque(f"rendu impossible {url}: {e}") from e
        finally:
            page.close()

    def close(self):
        if self._pw is not None:
            self._browser.close()
            self._pw_ctx.stop()
            self._pw = None
