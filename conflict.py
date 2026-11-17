"""Conflict reports for the data feed: strikes, shelling and clashes from the last 24 hours.

Reads the GDELT 2.0 event exports (one file every 15 minutes, free and open) and keeps the
events coded as military force or violence that are tied to a town or city, so each one can be
placed on the map. These are machine-coded from news reports: each item says so, names the type
of event, the place, when it was reported, how many sources reported it, and links the article.

Used by harvest.py; the app shows the result as the "Conflict reports" layer (src-41-feed.js).
"""

from __future__ import annotations

import csv
import io
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

GDELT = "http://data.gdeltproject.org/gdeltv2/"

# CAMEO event codes kept, most specific first: (code prefix, label, colour).
KINDS = [
    ("1952", "Drone strike", "#ff3b6b"),
    ("195", "Air strike", "#ff5a36"),
    ("194", "Artillery / shelling", "#ff8a1f"),
    ("183", "Bombing", "#ff2d2d"),
    ("186", "Assassination", "#d64dff"),
    ("193", "Armed clash", "#ffb02e"),
    ("20", "Mass violence", "#c2003a"),
    ("190", "Military force", "#ff9a6b"),
    ("196", "Ceasefire violation", "#ffc04d"),
]

# Column positions in the GDELT 2.0 event table (61 columns).
COL = {
    "id": 0,
    "actor1": 6,
    "actor2": 16,
    "code": 26,
    "sources": 32,
    "articles": 33,
    "geo_type": 51,
    "place": 52,
    "country": 53,
    "lat": 56,
    "lon": 57,
    "added": 59,
    "url": 60,
}
CITY_GEO_TYPES = {"3", "4"}  # US city, world city; country and state centres are too vague
MIN_ARTICLES = 2


def kind_of(code: str):
    for prefix, label, colour in KINDS:
        if code.startswith(prefix):
            return label, colour
    return None


def parse_rows(rows, now_ms: int):
    """GDELT event rows to map items, one per type and place, keeping the best-reported."""
    best: dict[tuple, dict] = {}
    for r in rows:
        if len(r) != 61:
            continue
        k = kind_of(r[COL["code"]])
        if not k or r[COL["geo_type"]] not in CITY_GEO_TYPES:
            continue
        try:
            lat, lon = float(r[COL["lat"]]), float(r[COL["lon"]])
            articles, sources = int(r[COL["articles"]] or 0), int(r[COL["sources"]] or 0)
            added = datetime.strptime(r[COL["added"]], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        url = r[COL["url"]]
        if articles < MIN_ARTICLES or not url.startswith("http") or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        label, colour = k
        key = (label, round(lat, 2), round(lon, 2))
        prev = best.get(key)
        if prev and prev["_a"] >= articles:
            prev["_n"] += 1
            continue
        actors = " · ".join(a.title() for a in (r[COL["actor1"]], r[COL["actor2"]]) if a)
        place = r[COL["place"]]
        best[key] = {
            "id": "conflict:" + r[COL["id"]],
            "kind": "info",
            "layer": "conflict",
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "n": label + " · " + place.split(",")[0],
            "color": colour,
            "tag": label.upper() + " · UNVERIFIED NEWS REPORT",
            "t": int(added.timestamp() * 1000),
            "rows": [
                ["TYPE", label],
                ["PLACE", place],
                ["REPORTED", added.strftime("%d %b %H:%M UTC")],
                ["ACTORS", actors or "—"],
                ["COVERAGE", "%d articles from %d sources" % (articles, sources)],
                ["STATUS", "Unverified · machine-coded from news by GDELT"],
            ],
            "links": [["Read the report · " + (urlparse(url).hostname or "source"), url]],
            "_a": articles,
            "_n": (prev["_n"] + 1) if prev else 1,
        }
    items = sorted(best.values(), key=lambda x: -x["t"])
    for it in items:
        it.pop("_a")
        n = it.pop("_n")
        if n > 1:
            it["rows"].insert(4, ["EVENTS HERE", "%d reports in 24 h" % n])
    return items


def stamps(now: datetime, hours: int = 24):
    """The 15-minute file names covering the last `hours`, newest first."""
    t = now.replace(second=0, microsecond=0, minute=now.minute - now.minute % 15)
    return [(t - timedelta(minutes=15 * i)).strftime("%Y%m%d%H%M%S") for i in range(1, hours * 4 + 1)]


def _fetch(stamp: str):
    try:
        with urllib.request.urlopen(GDELT + stamp + ".export.CSV.zip", timeout=40) as r:
            z = zipfile.ZipFile(io.BytesIO(r.read()))
        text = z.read(z.namelist()[0]).decode("utf-8", "replace")
        return list(csv.reader(io.StringIO(text), delimiter="\t"))
    except Exception:
        return []


def collect(hours: int = 24):
    """The conflict layer for layers.json: {t, items}."""
    now = datetime.now(timezone.utc)
    with ThreadPoolExecutor(max_workers=8) as pool:
        rows = [row for part in pool.map(_fetch, stamps(now, hours)) for row in part]
    items = parse_rows(rows, int(time.time() * 1000))
    return {"t": int(time.time() * 1000), "items": items[:4000]}
