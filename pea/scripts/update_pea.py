#!/usr/bin/env python3
"""Mise à jour quotidienne du tableau de bord PEA Buy & Hold.

Étapes : récupère les clôtures de la veille sur Yahoo Finance, recalcule les
scores d'opportunité, met à jour data/market.json et data/history.json,
régénère dist/index.html et dist/dashboard.html, puis envoie l'alerte du jour
(Discord, Telegram, e-mail) si les variables d'environnement sont définies.

Bibliothèque standard uniquement (Python 3.9+).

Usage :
    python3 pea/scripts/update_pea.py              # exécution normale
    python3 pea/scripts/update_pea.py --paris-gate # ne tourne qu'à partir de 6h Paris, une fois par jour
    python3 pea/scripts/update_pea.py --build-only # régénère le HTML depuis data/market.json
    python3 pea/scripts/update_pea.py --no-alert
"""

import argparse
import datetime as dt
import http.cookiejar
import json
import os
import smtplib
import sys
import time
import urllib.parse
import urllib.request
from email.mime.text import MIMEText
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "universe.json"
MARKET = ROOT / "data" / "market.json"
HISTORY = ROOT / "data" / "history.json"
TEMPLATE = ROOT / "web" / "template.html"
DIST = ROOT / "dist"

PARIS = ZoneInfo("Europe/Paris")
UA = "Mozilla/5.0"

_jar = http.cookiejar.CookieJar()
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_jar))


def http_get(url, retries=4, cookies=False):
    opener = _opener if cookies else urllib.request.build_opener()
    delay = 2
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/plain,*/*"})
            with opener.open(req, timeout=25) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404) or attempt == retries - 1:
                raise
        except Exception:
            if attempt == retries - 1:
                raise
        time.sleep(delay)
        delay *= 2


# --------------------------------------------------------------------------- données

def fetch_chart(ticker):
    """Deux ans de clôtures quotidiennes + dividendes (endpoint sans crumb)."""
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/" + urllib.parse.quote(ticker)
           + "?range=2y&interval=1d&events=div%7Csplit")
    res = json.loads(http_get(url))["chart"]["result"][0]
    ts = res.get("timestamp") or []
    closes = res["indicators"]["quote"][0]["close"]
    series = [(dt.datetime.fromtimestamp(t, PARIS).date().isoformat(), round(c, 3))
              for t, c in zip(ts, closes) if c is not None]
    divs = [(dt.datetime.fromtimestamp(int(d["date"]), PARIS).date().isoformat(), d["amount"])
            for d in (res.get("events", {}).get("dividends") or {}).values()]
    divs.sort()
    meta = res["meta"]
    return series, divs, meta


def fetch_fundamentals(tickers):
    """PER / BPA Yahoo (nécessite un crumb). Best effort : {} en cas d'échec."""
    try:
        try:
            http_get("https://fc.yahoo.com", retries=1, cookies=True)
        except Exception:
            pass  # renvoie souvent 404 mais pose le cookie
        crumb = http_get("https://query1.finance.yahoo.com/v1/test/getcrumb", retries=1, cookies=True).strip()
        if not crumb or " " in crumb or len(crumb) > 20:
            return {}
        url = ("https://query1.finance.yahoo.com/v7/finance/quote?symbols="
               + urllib.parse.quote(",".join(tickers)) + "&crumb=" + urllib.parse.quote(crumb))
        out = {}
        for q in json.loads(http_get(url, retries=1, cookies=True))["quoteResponse"]["result"]:
            out[q["symbol"]] = {
                "eps": q.get("epsTrailingTwelveMonths"),
                "pe": q.get("trailingPE"),
                "forward_pe": q.get("forwardPE"),
                "market_cap": q.get("marketCap"),
            }
        return out
    except Exception as e:
        print(f"  fondamentaux Yahoo indisponibles ({e}) : BPA de la configuration utilisés", file=sys.stderr)
        return {}


# --------------------------------------------------------------------------- moteur
# Toute modification ici doit être reportée dans computeScore() de web/template.html.

def clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def compute_score(s, weights, thresholds):
    price, dma, high = s["price"], s["dma200"], s["high52"]
    gap = price / dma - 1 if dma else 0.0
    dd = max(0.0, 1 - price / high) if high else 0.0
    s_dma = clamp(50 - gap * 200)
    s_dd = clamp(dd / 0.35 * 100)
    tech = 0.5 * s_dma + 0.5 * s_dd

    pe = s.get("pe")
    s_pe_hist = clamp(50 + (1 - pe / s["pe_hist"]) * 150) if pe and s.get("pe_hist") else 50.0
    s_pe_sector = clamp(50 + (1 - pe / s["pe_sector"]) * 100) if pe and s.get("pe_sector") else 50.0
    y = s.get("yield") or 0.0
    s_yield = clamp(50 + (y / s["yield_hist"] - 1) * 100) if s.get("yield_hist") else 50.0
    val = 0.45 * s_pe_hist + 0.25 * s_pe_sector + 0.30 * s_yield

    quality = ((s["moat"] + s["div_regularity"] + s["resilience"]) / 3 - 1) / 4 * 100
    coef = 0.85 + 0.30 * quality / 100
    raw = (weights["tech"] * tech + weights["valuation"] * val) * coef
    score = clamp(raw)

    if score >= thresholds["green"] and (dd >= 0.10 or gap < 0):
        cls = "green"
    elif score < thresholds["red"] or (dd <= thresholds["peak_dd"] and gap >= thresholds["peak_gap"]):
        cls = "red"
    else:
        cls = "yellow"
    return {
        "gap_dma200": round(gap, 4), "drawdown": round(dd, 4),
        "s_tech": round(tech, 1), "s_val": round(val, 1), "s_quality": round(quality, 1),
        "coef": round(coef, 3), "score_raw": round(raw, 1), "score": round(score, 1), "class": cls,
    }


def build_stock(cfg, series, divs, meta, fund):
    closes = [c for _, c in series]
    price = closes[-1]
    last_date = series[-1][0]
    window = closes[-200:]
    dma200 = sum(window) / len(window)
    last_year = closes[-252:]
    high52, low52 = max(last_year), min(last_year)
    one_year_ago = (dt.date.fromisoformat(last_date) - dt.timedelta(days=365)).isoformat()
    div_ttm = sum(a for d, a in divs if d > one_year_ago)

    f = fund.get(cfg["ticker"], {})
    if f.get("eps") and f["eps"] > 0 and not cfg.get("prefer_config_eps"):
        eps, eps_src = f["eps"], "yahoo"
    else:
        eps, eps_src = cfg.get("eps_ttm"), "config"
    pe = price / eps if eps and eps > 0 else None

    s = {k: cfg[k] for k in cfg}
    s.update({
        "price": price, "date": last_date, "currency": meta.get("currency", "EUR"),
        "dma200": round(dma200, 3), "high52": high52, "low52": low52,
        "eps": eps, "eps_source": eps_src, "pe": round(pe, 2) if pe else None,
        "forward_pe": f.get("forward_pe"), "market_cap": f.get("market_cap"),
        "div_ttm": round(div_ttm, 4), "yield": round(div_ttm / price * 100, 3) if price else 0,
        "dividends": [{"date": d, "amount": a} for d, a in divs[-8:]],
        "perf_1y": round(price / last_year[0] - 1, 4),
        # un an de clôtures pour le graphique (DMA 200 recalculée côté page)
        "history": series[-452:],
    })
    return s


# --------------------------------------------------------------------------- génération

def build_html(market):
    tpl = TEMPLATE.read_text(encoding="utf-8")
    if HISTORY.exists():
        hist = json.loads(HISTORY.read_text(encoding="utf-8"))
        market = dict(market, score_history={d: {k: v["score"] for k, v in hist[d].items()} for d in sorted(hist)[-90:]})
    payload = json.dumps(market, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    fragment = tpl.replace("__PEA_DATA__", payload)
    DIST.mkdir(exist_ok=True)
    (DIST / "dashboard.html").write_text(fragment, encoding="utf-8")
    full = ('<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '</head>\n<body>\n' + fragment + '\n</body>\n</html>\n')
    (DIST / "index.html").write_text(full, encoding="utf-8")


def update_history(market):
    hist = json.loads(HISTORY.read_text(encoding="utf-8")) if HISTORY.exists() else {}
    day = market["as_of"]
    hist[day] = {s["ticker"]: {"score": s["score"], "class": s["class"], "price": s["price"]}
                 for s in market["stocks"]}
    keep = sorted(hist)[-400:]
    hist = {k: hist[k] for k in keep}
    HISTORY.write_text(json.dumps(hist, ensure_ascii=False, indent=1), encoding="utf-8")
    return hist


# --------------------------------------------------------------------------- alertes

LABEL = {"green": "🟢 Forte opportunité", "yellow": "🟡 Accumulation", "red": "🔴 Attendre"}


def alert_text(market, hist):
    stocks = sorted(market["stocks"], key=lambda s: -s["score_raw"])
    n = market["settings"].get("alert_top_n", 3)
    lines = [f"PEA Buy & Hold : opportunités du {market['as_of']}", ""]
    for s in stocks[:n]:
        lines.append(f"{LABEL[s['class']]}  {s['name']} ({s['ticker']}) : score {s['score']:.0f}/100, "
                     f"{s['price']:.2f} €, {s['drawdown']*100:.1f} % sous le plus haut 52 s, "
                     f"{s['gap_dma200']*100:+.1f} % vs DMA 200")
    days = sorted(hist)
    if len(days) >= 2:
        prev = hist[days[-2]]
        changes = [f"{s['name']} : {LABEL[prev[s['ticker']]['class']]} → {LABEL[s['class']]}"
                   for s in stocks if s["ticker"] in prev and prev[s["ticker"]]["class"] != s["class"]]
        if changes:
            lines += ["", "Changements de signal :"] + changes
    counts = {c: sum(1 for s in stocks if s["class"] == c) for c in LABEL}
    lines += ["", f"{counts['green']} forte(s) opportunité(s), {counts['yellow']} en accumulation, {counts['red']} à attendre."]
    url = os.environ.get("PEA_DASHBOARD_URL")
    if url:
        lines.append(url)
    return "\n".join(lines)


def post_json(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "User-Agent": UA})
    urllib.request.urlopen(req, timeout=20).read()


def send_alerts(text):
    sent = []
    if os.environ.get("DISCORD_WEBHOOK_URL"):
        post_json(os.environ["DISCORD_WEBHOOK_URL"], {"content": text[:1990]})
        sent.append("Discord")
    if os.environ.get("TELEGRAM_BOT_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID"):
        post_json(f"https://api.telegram.org/bot{os.environ['TELEGRAM_BOT_TOKEN']}/sendMessage",
                  {"chat_id": os.environ["TELEGRAM_CHAT_ID"], "text": text})
        sent.append("Telegram")
    if os.environ.get("SMTP_HOST") and os.environ.get("ALERT_EMAIL_TO"):
        msg = MIMEText(text, "plain", "utf-8")
        msg["Subject"] = text.splitlines()[0]
        msg["From"] = os.environ.get("SMTP_FROM", os.environ.get("SMTP_USER", ""))
        msg["To"] = os.environ["ALERT_EMAIL_TO"]
        with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587")), timeout=30) as smtp:
            smtp.starttls()
            if os.environ.get("SMTP_USER"):
                smtp.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
            smtp.send_message(msg)
        sent.append("e-mail")
    return sent


# --------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--paris-gate", action="store_true",
                    help="sortir sans rien faire avant 6h (heure de Paris) ou si le run du jour existe déjà")
    ap.add_argument("--build-only", action="store_true")
    ap.add_argument("--no-alert", action="store_true")
    args = ap.parse_args()

    now = dt.datetime.now(PARIS)
    if args.paris_gate:
        if now.hour < 6:
            print(f"{now:%H:%M} à Paris : avant 6h, rien à faire.")
            return 0
        if MARKET.exists() and json.loads(MARKET.read_text(encoding="utf-8")).get("run_date") == now.date().isoformat():
            print("Run du jour déjà effectué.")
            return 0

    if args.build_only:
        build_html(json.loads(MARKET.read_text(encoding="utf-8")))
        print("HTML régénéré.")
        return 0

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    settings = cfg["settings"]
    tickers = [t["ticker"] for t in cfg["tickers"]]
    fund = fetch_fundamentals(tickers)

    stocks, errors = [], []
    for t in cfg["tickers"]:
        try:
            series, divs, meta = fetch_chart(t["ticker"])
            s = build_stock(t, series, divs, meta, fund)
            s.update(compute_score(s, settings["weights"], settings["thresholds"]))
            stocks.append(s)
            print(f"  {t['ticker']:9} {s['price']:>9.2f}  score {s['score']:5.1f}  {s['class']}")
        except Exception as e:
            errors.append(f"{t['ticker']}: {e}")
            print(f"  {t['ticker']:9} ERREUR {e}", file=sys.stderr)
        time.sleep(0.6)

    if not stocks:
        print("Aucune donnée récupérée, fichiers inchangés.", file=sys.stderr)
        return 1

    market = {
        "as_of": max(s["date"] for s in stocks),
        "run_date": now.date().isoformat(),
        "generated_at": now.isoformat(timespec="minutes"),
        "source": "Yahoo Finance (clôtures quotidiennes, endpoint chart v8)",
        "fundamentals_source": "yahoo" if fund else "config",
        "settings": settings,
        "errors": errors,
        "stocks": sorted(stocks, key=lambda s: -s["score_raw"]),
    }
    MARKET.parent.mkdir(exist_ok=True)
    MARKET.write_text(json.dumps(market, ensure_ascii=False, indent=1), encoding="utf-8")
    hist = update_history(market)
    build_html(market)

    text = alert_text(market, hist)
    print("\n" + text)
    if not args.no_alert:
        try:
            sent = send_alerts(text)
            print("Alerte envoyée : " + (", ".join(sent) if sent else "aucun canal configuré"))
        except Exception as e:
            print(f"Échec de l'envoi de l'alerte : {e}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
