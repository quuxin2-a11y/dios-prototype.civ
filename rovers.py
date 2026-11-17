"""Where NASA's Mars rovers are now, for the data feed.

NASA's "Where is the rover?" maps publish each drive's end point as GeoJSON (one point per
waypoint, with the sol it was reached). The latest point is the rover's position. The app's 3D
space view (src-40-sky.js) places Perseverance and Curiosity there, and keeps built-in
positions when this is missing.

Used by harvest.py, which writes the result into meta.json under "rovers".
"""

from __future__ import annotations

import json
import urllib.request

SOURCES = {
    "m20": "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json",
    "msl": "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json",
}


def latest(geojson: dict) -> dict | None:
    """The waypoint with the highest sol (the last one listed when sols tie): {lat, lon, sol}."""
    best = None
    for i, f in enumerate((geojson or {}).get("features") or []):
        g = (f or {}).get("geometry") or {}
        c = g.get("coordinates") or []
        if g.get("type") != "Point" or len(c) < 2:
            continue
        try:
            lon, lat = float(c[0]), float(c[1])
            sol = float(((f.get("properties") or {}).get("sol")) or 0)
        except (TypeError, ValueError):
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 360):
            continue
        key = (sol, i)
        if best is None or key >= best[0]:
            best = (key, {"lat": round(lat, 5), "lon": round(((lon + 180) % 360) - 180, 5), "sol": int(sol)})
    return best[1] if best else None


def _get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "OjosDeDios-feed"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


def collect() -> dict:
    """{name: {lat, lon, sol}} for each rover whose map answered."""
    out = {}
    for name, url in SOURCES.items():
        try:
            pos = latest(_get(url))
        except Exception:  # one map down leaves the other
            pos = None
        if pos:
            out[name] = pos
    return out
