#!/usr/bin/env python3
"""Build the shared data feed: every public camera network and worldwide layer, in two files.

Opens the built app (index.html) in headless Chromium, lets it load every camera network and
every data layer that does not depend on the view, then writes:

  OUT/cams.json    compact camera rows (see feedEncode in src-41-feed.js)
  OUT/layers.json  items of the worldwide layers
  OUT/meta.json    counts and timing, for a quick look at a run

The app reads these at start-up (module 41), so a phone gets everything in one download
instead of asking each network itself. The page runs exactly as it does on a phone; the only
difference is that cross-origin replies are passed through here, as the Android app's native
requests do, because a plain browser page would be blocked by CORS.

Usage
  python3 harvest.py OUT_DIR        (used by .github/workflows/data.yml)

Exits 1 without writing anything if too few cameras loaded, so a bad run never replaces a
good feed.
"""

import functools
import http.server
import json
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

import conflict

ROOT = Path(__file__).resolve().parent
MIN_CAMS = 5000  # far below a normal run (40,000+); anything less means the run went wrong
MAX_S = 420  # stop waiting after 7 minutes
STABLE_S = 45  # finished when nothing new has loaded for this long
SKIP_TYPES = {"image", "media", "font", "stylesheet"}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def pass_through(route):
    """Fetch cross-origin requests here and hand them to the page with CORS allowed."""
    req = route.request
    if req.url.startswith("http://127.0.0.1"):
        route.continue_()
        return
    if req.resource_type in SKIP_TYPES:
        route.abort()
        return
    cors = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
    }
    if req.method == "OPTIONS":
        route.fulfill(status=204, headers=cors)
        return
    try:
        resp = route.fetch(timeout=45000)
    except Exception:
        route.abort()
        return
    headers = {k: v for k, v in resp.headers.items() if k.lower() not in ("content-encoding", "content-length")}
    headers.update(cors)
    route.fulfill(response=resp, headers=headers)


def main(out_dir):
    out = Path(out_dir)
    handler = functools.partial(Quiet, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = "http://127.0.0.1:%d/index.html" % server.server_address[1]

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_context(viewport={"width": 412, "height": 915}).new_page()
        page.route("**/*", pass_through)
        page.add_init_script("window.__ODD_HARVEST = true;")
        page.add_init_script(
            "localStorage.setItem('ojos-onb', 'true');"
            "localStorage.setItem('ojos-set', JSON.stringify({look: 'classic', lookV: 3}));"
        )
        page.goto(url)
        page.wait_for_function("() => window.__oddHarvest", timeout=60000)
        page.evaluate("() => window.__oddHarvest.start()")

        t0 = time.time()
        last, last_change = None, time.time()
        while time.time() - t0 < MAX_S:
            time.sleep(5)
            st = page.evaluate("() => window.__oddHarvest.status()")
            key = (st["cams"], st["networks"])
            if key != last:
                last, last_change = key, time.time()
            print("%3ds  cameras %6d  networks %3d  layers loading %d"
                  % (time.time() - t0, st["cams"], st["networks"], st["layersBusy"]), flush=True)
            if time.time() - t0 > 90 and time.time() - last_change > STABLE_S and not st["layersBusy"]:
                break

        data = page.evaluate("() => window.__oddHarvest.collect()")
        browser.close()
    server.shutdown()

    cams, layers = data["cams"], data["layers"]
    n = len(cams["rows"])
    print("cameras %d from %d networks; layers %d" % (n, len(cams["srcs"]), len(layers["layers"])))
    if n < MIN_CAMS:
        print("too few cameras; the feed is left as it was", file=sys.stderr)
        return 1

    # Conflict reports come straight from GDELT's event files rather than through the app.
    try:
        layers["layers"]["conflict"] = conflict.collect()
        print("conflict reports %d" % len(layers["layers"]["conflict"]["items"]))
    except Exception as e:  # the rest of the feed is still published
        print("conflict reports skipped: %s" % e, file=sys.stderr)

    out.mkdir(parents=True, exist_ok=True)
    dump = functools.partial(json.dumps, separators=(",", ":"), ensure_ascii=False)
    (out / "cams.json").write_text(dump(cams), encoding="utf-8")
    (out / "layers.json").write_text(dump(layers), encoding="utf-8")
    meta = {
        "t": cams["t"],
        "cameras": n,
        "networks": cams["srcs"],
        "layers": {k: len(v["items"]) for k, v in layers["layers"].items()},
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
