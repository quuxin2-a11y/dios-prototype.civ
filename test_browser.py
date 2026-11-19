"""Browser tests: load the built app in headless Chromium and use its main screens.

Every request outside the local test server is blocked, so the results do not depend on
public sources being up, and the tests also check that the app copes when they are down.

Run:
    python3 -m pip install playwright && python3 -m playwright install chromium
    python3 -m unittest -v test_browser
"""

import base64
import functools
import http.server
import json
import threading
import time
import unittest
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - only when Playwright is not installed
    sync_playwright = None

ROOT = Path(__file__).resolve().parent
PHONE = {"width": 412, "height": 915}
SETTLE_MS = 2500

# Two vehicles in the shape of the MBTA V3 API's /vehicles response, used instead of the live API.
MBTA_SAMPLE = {
    "data": [
        {
            "type": "vehicle",
            "id": "y1836",
            "attributes": {
                "bearing": 358,
                "current_status": "STOPPED_AT",
                "label": "1836",
                "latitude": 42.3554,
                "longitude": -71.0605,
                "occupancy_status": "MANY_SEATS_AVAILABLE",
                "speed": None,
                "updated_at": "2026-11-16T10:00:00-05:00",
            },
            "relationships": {
                "route": {"data": {"id": "22", "type": "route"}},
                "stop": {"data": {"id": "1216", "type": "stop"}},
            },
        },
        {
            "type": "vehicle",
            "id": "G-10147",
            "attributes": {
                "bearing": 135,
                "current_status": "IN_TRANSIT_TO",
                "label": "3662-3820",
                "latitude": 42.35,
                "longitude": -71.07,
                "speed": 11.1,
                "updated_at": "2026-11-16T10:00:00-05:00",
            },
            "relationships": {
                "route": {"data": {"id": "Green-D", "type": "route"}},
                "stop": {"data": {"id": "70178", "type": "stop"}},
            },
        },
    ],
    "included": [
        {
            "type": "route",
            "id": "22",
            "attributes": {"short_name": "22", "type": 3, "color": "FFC72C"},
        },
        {
            "type": "route",
            "id": "Green-D",
            "attributes": {"long_name": "Green Line D", "type": 0},
        },
        {
            "type": "stop",
            "id": "1216",
            "attributes": {"name": "Talbot Ave @ Washington St"},
        },
        {"type": "stop", "id": "70178", "attributes": {"name": "Fenway"}},
    ],
}


def _topology(obj_name, features):
    """A minimal TopoJSON topology with one unquantized arc per polygon."""
    arcs, geoms = [], []
    for name, ring in features:
        arcs.append(ring)
        geoms.append(
            {"type": "Polygon", "arcs": [[len(arcs) - 1]], "properties": {"name": name}}
        )
    return {
        "type": "Topology",
        "objects": {obj_name: {"type": "GeometryCollection", "geometries": geoms}},
        "arcs": arcs,
    }


# Sample responses in the shape of each public source, used instead of the live services.
SAMPLES = {
    "us-atlas": _topology(
        "states",
        [
            (
                "Texas",
                [
                    [-106.6, 31.9],
                    [-93.5, 31.9],
                    [-93.5, 26],
                    [-97.1, 26],
                    [-106.6, 31.9],
                ],
            )
        ],
    ),
    "world-atlas": _topology(
        "countries",
        [("Japan", [[129, 31], [146, 31], [146, 45], [129, 45], [129, 31]])],
    ),
    "CurrentStorms.json": {
        "activeStorms": [
            {
                "id": "al052026",
                "name": "Ernesto",
                "classification": "HU",
                "intensity": "100",
                "pressure": "960",
                "latitudeNumeric": 26.1,
                "longitudeNumeric": -94.2,
                "movementDir": 315,
                "movementSpeed": 12,
                "lastUpdate": "2026-11-16T15:00:00.000Z",
            }
        ]
    },
    "noaa-planetary-k-index": [{"time_tag": "2026-11-16T09:00:00", "Kp": 5.33}],
    "bwtnew": [
        {
            "port_number": "250401",
            "border": "Mexican Border",
            "port_name": "San Ysidro",
            "crossing_name": "San Ysidro",
            "port_status": "Open",
            "date": "11/16/2026",
            "time": "10:00:00",
            "passenger_vehicle_lanes": {
                "standard_lanes": {
                    "operational_status": "delay",
                    "delay_minutes": "55",
                    "lanes_open": "20",
                }
            },
        }
    ],
    "outages/summary": {
        "data": [
            {
                "scores": {"bgp.median": 2500000, "overall": 2500000},
                "event_cnt": 3,
                "entity": {"code": "KG", "name": "Kyrgyzstan", "type": "country"},
            }
        ]
    },
    "nwr/JS/CCL.js": (
        'ST[0] = "TX";\nCOUNTY[0] = "Travis";\nSITENAME[0] = "Austin";\nSITESTATE[0] = "TX";\n'
        'FREQ[0] = "162.400";\nCALLSIGN[0] = "WXK27";\nLAT[0] = "30.32";\nLON[0] = "-97.77";\n'
        'STATUS[0] = "NORMAL";\nWFO[0] = "Austin/San Antonio|TX";\n'
    ),
    "hms_smoke": (
        '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder>'
        "<Placemark><description><![CDATA[<div>Start Time: 2026319 1300UTC<br>End Time: "
        "2026319 1600UTC<br>Density: Heavy<br>Satellite: GOES-WEST</div>]]></description>"
        "<Polygon><outerBoundaryIs><LinearRing><coordinates>-120,40,0 -118,40,0 -118,42,0 "
        "-120,42,0 -120,40,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>"
        "</Folder></Document></kml>"
    ),
    "hms_fire": (
        "Lon, Lat, YearDay, Time, Satellite, Method, Ecosystem, FRP\n"
        "-119.5, 41.0, 2026319, 0301, GOES-WEST, NGFS, 24, 55.0\n"
    ),
    "airport-status-information": (
        "<AIRPORT_STATUS_INFORMATION><Update_Time>Mon Nov 16 21:09:57 2026 GMT</Update_Time>"
        "<Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List><Ground_Delay>"
        "<ARPT>SFO</ARPT><Reason>low ceilings</Reason><Avg>1 hour and 5 minutes</Avg>"
        "<Max>2 hours and 28 minutes</Max></Ground_Delay></Ground_Delay_List></Delay_type>"
        "</AIRPORT_STATUS_INFORMATION>"
    ),
    "aviationweather.gov/api/data/airport": [
        {
            "icaoId": "KSFO",
            "iataId": "SFO",
            "faaId": "SFO",
            "name": "SAN FRANCISCO/SAN FRANCISCO INTL ",
            "lat": 37.6188,
            "lon": -122.3754,
        }
    ],
    "diseaseoutbreaknews": {
        "value": [
            {
                "Title": "Middle East respiratory syndrome (MERS) – Qatar",
                "UrlName": "2026-DON626",
                "PublicationDateAndTime": "2026-11-13T19:00:00Z",
            }
        ]
    },
    "api.worldbank.org/v2/country?": [
        {"page": 1},
        [
            {
                "id": "QAT",
                "iso2Code": "QA",
                "name": "Qatar",
                "capitalCity": "Doha",
                "latitude": "25.2948",
                "longitude": "51.5082",
            }
        ],
    ],
    "Smithsonian_VOTW_Holocene_Volcanoes": {
        "features": [
            {
                "properties": {
                    "Volcano_Number": 311120,
                    "Volcano_Name": "Great Sitkin",
                    "Last_Eruption_Year": 2026,
                },
                "geometry": {"type": "Point", "coordinates": [-176.11, 52.08]},
            }
        ]
    },
    "getElevatedVolcanoes": [
        {"vnum": "311120", "color_code": "ORANGE", "alert_level": "WATCH"}
    ],
    "USDM_current": {
        "features": [
            {
                "properties": {"DM": 2},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [[-100, 35], [-98, 35], [-98, 37], [-100, 37], [-100, 35]]
                    ],
                },
            }
        ]
    },
    "cable/cable-geo.json": {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": "marea",
                    "name": "MAREA",
                    "color": "#e3317d",
                    "coordinates": [-40, 40],
                },
                "geometry": {
                    "type": "MultiLineString",
                    "coordinates": [
                        [[-75.98, 36.85], [-50, 39], [-20, 42], [-2.93, 43.26]]
                    ],
                },
            }
        ],
    },
    "cable/marea.json": {
        "id": "marea",
        "name": "MAREA",
        "length": "6,605 km",
        "owners": "Meta, Microsoft, Telxius",
        "suppliers": "SubCom",
        "rfs": "2018 May",
        "is_planned": False,
        "landing_points": [
            {"name": "Bilbao, Spain"},
            {"name": "Virginia Beach, VA, United States"},
        ],
    },
    "overpass-api.de/api/interpreter": {
        "elements": [
            {
                "type": "way",
                "id": 1,
                "tags": {"building": "commercial", "height": "381"},
                "geometry": [
                    {"lat": 40.748, "lon": -73.986},
                    {"lat": 40.749, "lon": -73.986},
                    {"lat": 40.749, "lon": -73.985},
                    {"lat": 40.748, "lon": -73.986},
                ],
            },
            {
                "type": "way",
                "id": 2,
                "tags": {"highway": "primary"},
                "geometry": [
                    {"lat": 40.748, "lon": -73.99},
                    {"lat": 40.75, "lon": -73.98},
                ],
            },
        ]
    },
    "dx9v-zd7x": [
        {
            "traffic_report_id": "T1",
            "issue_reported": "COLLISION",
            "latitude": "30.27",
            "longitude": "-97.74",
            "address": "Congress Ave & 6th St",
            "published_date": "2026-11-16T17:00:00.000Z",
            "agency": "AUSTIN PD",
        }
    ],
}


# A stand-in for CesiumJS: every property and call returns another stand-in, except the
# collections and camera the Earth view relies on, which record what the app adds.
MAPLIBRE_STANDIN = """
(() => {
  const rec = window.__ml = { sources: {}, layers: [], maps: 0 };
  const noop = () => {};
  class Map {
    constructor(o) {
      rec.maps++;
      rec.style = o.style;
      this.z = o.zoom;
      this.c = { lng: o.center[0], lat: o.center[1] };
      this.h = {};
      setTimeout(() => (this.h.load || []).forEach((f) => f({})), 50);
      window.__mlMap = this;
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : noop) });
    }
    on(ev, a, b) { if (!b) (this.h[ev] = this.h[ev] || []).push(a); return this; }
    addSource(id, d) { rec.sources[id] = d; }
    getSource(id) { return rec.sources[id] && { setData: (x) => { rec.sources[id].data = x; } }; }
    addLayer(l) { rec.layers.push(l.id); }
    getLayer(id) { return rec.layers.includes(id) ? {} : undefined; }
    getZoom() { return this.z; }
    getCenter() { return this.c; }
    getPitch() { return 0; }
    getBearing() { return 0; }
    jumpTo(o) { if (o.zoom != null) this.z = o.zoom; if (o.center) this.c = { lng: o.center[0], lat: o.center[1] }; }
    easeTo(o) { this.jumpTo(o); }
    flyTo(o) { this.jumpTo(o); }
    queryRenderedFeatures() { return []; }
    getCanvas() { return document.createElement('canvas'); }
    project(ll) { const k = 40 * Math.pow(2, this.z - 8); return { x: (ll[0] - this.c.lng) * k + innerWidth / 2, y: (this.c.lat - ll[1]) * k + innerHeight / 2 }; }
    getBounds() { return { getWest: () => this.c.lng - 1, getEast: () => this.c.lng + 1, getSouth: () => this.c.lat - 1, getNorth: () => this.c.lat + 1 }; }
  }
  window.maplibregl = { Map, NavigationControl: function () {}, AttributionControl: function () {} };
})();
"""

# three.js stand-in: every call answers, and the renderer draws into a real canvas.
THREE_STANDIN = """
(() => {
  const any = () => new Proxy(function () {}, {
    get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any(),
    apply: () => any(),
    construct: () => any(),
    set: () => true,
  });
  window.__three = { renders: 0 };
  window.THREE = new Proxy({}, {
    get: (t, k) => k === 'WebGLRenderer'
      ? function () { const c = document.createElement('canvas'); return new Proxy({}, { get: (t2, k2) => k2 === 'domElement' ? c : k2 === 'render' ? () => { window.__three.renders++; } : any(), set: () => true }); }
      : any(),
  });
})();
"""


CESIUM_STANDIN = """
(() => {
  const any = () => new Proxy(function () {}, {
    get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any(),
    apply: () => any(),
    construct: () => any(),
    set: () => true,
  });
  const rec = window.__cz = { points: {}, lines: 0, prims: 0, globe: false };
  let n = 0;
  class Coll {
    constructor(kind) { this.id = kind + (n++); this.items = []; this.show = true; }
    add(o) { this.items.push(o); rec.points[this.id] = this.items.length; return o; }
    removeAll() { this.items = []; rec.points[this.id] = 0; }
  }
  class Points extends Coll { constructor() { super('p'); } }
  class Lines extends Coll {
    constructor() { super('l'); }
    add(o) { rec.lines++; return super.add(o); }
    removeAll() { rec.lines = 0; super.removeAll(); }
  }
  const base = any();
  window.Cesium = new Proxy({}, {
    get: (t, k) => {
      if (k === 'PointPrimitiveCollection') return Points;
      if (k === 'PolylineCollection') return Lines;
      if (k === 'createGooglePhotorealistic3DTileset') return () => { rec.google = (rec.google || 0) + 1; return Promise.resolve(any()); };
      if (k === 'Cartographic') return { fromCartesian: () => ({ latitude: 0.711, longitude: -1.2913, height: 3000 }) };
      if (k === 'Viewer') return function () {
        const prims = { add: (x) => { rec.prims++; return x; }, remove: () => true };
        const scene = new Proxy({}, { get: (t3, k3) => k3 === 'primitives' ? prims : k3 === 'canvas' ? document.createElement('canvas') : k3 === 'globe' ? (rec.globe ? any() : undefined) : any(), set: (t3, k3) => { if (k3 === 'globe') rec.globe = true; return true; } });
        return new Proxy({}, { get: (t2, k2) => {
          if (k2 === 'scene') return scene;
          if (k2 === 'camera') return new Proxy({}, { get: (t4, k4) => k4 === 'positionCartographic' ? { height: window.__czH || 1.6e7, latitude: 0.711, longitude: -1.2913 } : k4 === 'pickEllipsoid' ? () => null : any() });
          return any();
        }, set: () => true });
      };
      return base[k];
    },
  });
})();
"""


# A 1x1 PNG stands in for satellite tiles.
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@unittest.skipIf(sync_playwright is None, "Playwright is not installed")
class AppInBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(QuietHandler, directory=str(ROOT))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = "http://127.0.0.1:%d/index.html" % cls.server.server_address[1]
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(viewport=PHONE)
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.route("**/*", self._local_only)
        # Skip the first-run introduction so the tests start on the globe.
        self.page.add_init_script("localStorage.setItem('ojos-onb', 'true')")
        # Most tests exercise the original screen, which only the tests can ask for; the dashboard
        # (the app's only screen) has its own tests, which call use_dashboard().
        self.page.add_init_script("window.__ODD_CLASSIC = true;")
        self.page.goto(self.url)
        self.page.wait_for_timeout(SETTLE_MS)

    def tearDown(self):
        self.context.close()

    @staticmethod
    def _local_only(route):
        url = route.request.url
        if url.startswith("http://127.0.0.1"):
            route.continue_()
        elif any(k in url for k in SAMPLES):
            key = next(k for k in SAMPLES if k in url)
            body = SAMPLES[key]
            route.fulfill(
                body=body if isinstance(body, str) else json.dumps(body),
                content_type=(
                    "text/plain" if isinstance(body, str) else "application/json"
                ),
                headers={"access-control-allow-origin": "*"},
            )
        elif url.startswith("https://gibs.earthdata.nasa.gov/"):
            route.fulfill(
                body=PNG_1PX,
                content_type="image/png",
                headers={"access-control-allow-origin": "*"},
            )
        elif url.startswith("https://api-v3.mbta.com/vehicles"):
            route.fulfill(
                body=json.dumps(MBTA_SAMPLE),
                content_type="application/json",
                headers={"access-control-allow-origin": "*"},
            )
        else:
            route.abort()

    def use_dashboard(self):
        self.page.add_init_script("window.__ODD_CLASSIC = false;")

    def open_map(self, page=None):
        """The app opens on the Smooth globe; zooming in hands over to the map engine. Zoom in until it has."""
        p = page or self.page
        p.wait_for_function("() => document.body.classList.contains('rw-canvas')", timeout=8000)
        p.wait_for_timeout(1700)  # the globe holds for a moment after it opens
        vp = p.viewport_size
        p.mouse.move(vp["width"] / 2, vp["height"] / 2)
        for _ in range(8):
            p.mouse.wheel(0, -500)
            p.wait_for_timeout(60)
        p.wait_for_function("() => document.body.classList.contains('rw-globe') && window.__mlMap", timeout=8000)
        p.wait_for_timeout(300)

    def visible(self, selector):
        return self.page.is_visible(selector)

    def test_loads_without_script_errors(self):
        self.assertIn("OJOS DE DIOS", self.page.title())
        self.assertTrue(self.visible("#bEmg"))
        self.assertEqual(self.errors, [])

    def test_globe_canvas_is_drawn(self):
        size = self.page.evaluate(
            "() => { const c = document.getElementById('map'); return [c.width, c.height]; }"
        )
        self.assertGreater(size[0], 0)
        self.assertGreater(size[1], 0)

    def test_bundled_data_is_embedded(self):
        counts = self.page.evaluate(
            """() => ['gaz', 'cam-data', 'models', 'land-dots', 'ports', 'countries'].map(
                id => JSON.parse(document.getElementById(id).textContent)
            ).map(d => Array.isArray(d) ? d.length : Object.keys(d).length)"""
        )
        for n in counts:
            self.assertGreater(n, 0)

    def test_finder_opens_with_search_box(self):
        self.page.click("#bFind")
        self.assertTrue(self.visible("#fnd"))
        self.assertTrue(self.visible("#fndQ"))

    def test_records_opens_with_search_box(self):
        self.page.click("#bRec")
        self.assertTrue(self.visible("#rec"))
        self.assertTrue(self.visible("#recQ"))

    def test_country_file_opens(self):
        self.page.click("#bCty")
        self.assertTrue(self.visible("#cty"))
        self.assertTrue(self.visible("#ctyQ"))

    def test_emergency_mode_needs_confirmation(self):
        html_class = "() => document.documentElement.className"
        self.page.click("#bEmg")
        self.assertTrue(self.visible("#emgask"))
        self.assertIn("State of Emergency", self.page.inner_text("#emgask"))
        self.page.click("[data-em=no]")
        self.assertNotIn("emg", self.page.evaluate(html_class).split())
        self.page.click("#bEmg")
        self.page.click("[data-em=yes]")
        self.page.wait_for_timeout(500)
        self.assertIn("emg", self.page.evaluate(html_class).split())
        self.assertEqual(self.errors, [])

    def test_emergency_checklist_ticks_off_and_remembers(self):
        self.page.click("#bEmg")
        self.page.click("[data-em=yes]")
        self.page.wait_for_selector("#emgp [data-em='chk']", timeout=5000)
        self.assertIn("0 OF 13 READY", self.page.inner_text("#emgp"))
        self.page.click("#emgp [data-em='chk']")
        self.assertEqual(self.page.locator("#emgp [data-emck]").count(), 13)
        self.page.click("#emgp .emck:has-text('Water')")
        self.page.click("#emgp .emck:has-text('Cash')")
        self.assertIn("2 OF 13 READY", self.page.inner_text("#emgp"))
        self.assertTrue(self.page.is_checked("#emgp [data-emck='0']"))
        # My own item and a quick note.
        self.page.fill("#emgOwn", "Inhaler")
        self.page.press("#emgOwn", "Enter")
        self.assertIn("2 OF 14 READY", self.page.inner_text("#emgp"))
        self.page.click("#emgp .emck:has-text('Inhaler') label")
        self.assertIn("3 OF 14 READY", self.page.inner_text("#emgp"))
        self.page.fill("#emgNote", "Meet at the church on 5th")
        # Without a position there is no route yet, and it says so.
        self.assertIn("A ROUTE IS OFFERED HERE", self.page.inner_text("#emgp"))
        # Everything survives closing the app.
        self.page.reload()
        ticks = json.loads(self.page.evaluate("() => localStorage.getItem('ojos-emg-chk')"))
        self.assertEqual(sorted(ticks), sorted(["0", "4", "o" + json.loads(self.page.evaluate("() => localStorage.getItem('ojos-emg-own')"))[0]["id"]]))
        self.assertEqual(json.loads(self.page.evaluate("() => localStorage.getItem('ojos-emg-note')")), "Meet at the church on 5th")
        self.page.click("#bEmg")
        self.page.click("[data-em=yes]")
        self.page.wait_for_selector("#emgp [data-em='chk']", timeout=5000)
        self.page.click("#emgp [data-em='chk']")
        self.assertEqual(self.page.input_value("#emgNote"), "Meet at the church on 5th")
        self.page.click("#emgp .emck:has-text('Inhaler') [data-em^='ox-']")
        self.assertIn("2 OF 13 READY", self.page.inner_text("#emgp"))
        self.assertEqual(self.errors, [])

    def test_visual_positioning_is_offered_and_explains_itself_outside_the_app(self):
        self.page.click("#bEmg")
        self.page.click("[data-em=yes]")
        self.page.wait_for_selector("#emgp [data-vps='pinpoint']", timeout=5000)
        self.assertTrue(self.visible("#emgp [data-vps='around']"))
        self.page.click("#emgp [data-vps='pinpoint']")
        self.page.wait_for_selector(".toast:has-text('VISUAL POSITIONING')", timeout=3000)
        self.assertIn("Android app", self.page.inner_text(".toast"))
        self.assertEqual(self.errors, [])

    def test_emergency_panel_holds_still_while_scrolling_and_keeps_its_place(self):
        self.page.click("#bEmg")
        self.page.click("[data-em=yes]")
        self.page.wait_for_selector("#emgp [data-em='chk']", timeout=5000)
        self.page.wait_for_timeout(1500)
        # The "open" pill is not shown over the open panel.
        self.assertFalse(self.visible("#emgpill"))
        self.page.evaluate("() => { document.querySelector('#emgp .nl').scrollTop = 60; }")
        # The button tapped stays under the finger when the panel redraws.
        where = """() => { const sc = document.querySelector('#emgp .nl'), b = sc.querySelector("[data-em='chk']");
            return Math.round(b.getBoundingClientRect().top - sc.getBoundingClientRect().top); }"""
        at = self.page.evaluate(where)
        self.page.evaluate("() => document.querySelector(\"#emgp [data-em='chk']\").click()")
        self.assertEqual(self.page.locator("#emgp [data-emck]").count(), 13)
        self.assertLess(abs(self.page.evaluate(where) - at), 3)
        # While scrolling, a redraw waits until the finger has stopped.
        self.page.dispatch_event("#emgp .nl", "wheel")
        self.page.evaluate("() => document.querySelector(\"#emgp [data-em='chk']\").click()")
        self.page.wait_for_timeout(400)
        self.assertEqual(self.page.locator("#emgp [data-emck]").count(), 13)
        self.page.wait_for_timeout(1600)
        self.assertEqual(self.page.locator("#emgp [data-emck]").count(), 0)
        self.assertEqual(self.errors, [])

    def test_emergency_mode_plays_live_local_radio_in_the_app(self):
        import io
        import wave

        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(8000)
            w.writeframes(b"\0\0" * 80000)  # ten seconds of silence
        stations = [
            {"stationuuid": "s1", "name": "KERA News", "url_resolved": "https://stream.example.org/kera.wav", "tags": "news,npr", "geo_lat": 32.79, "geo_long": -96.80, "lastcheckok": 1},
            {"stationuuid": "s2", "name": "Hits 98", "url_resolved": "https://stream.example.org/hits.wav", "tags": "pop", "geo_lat": 32.70, "geo_long": -96.90, "lastcheckok": 1},
            {"stationuuid": "s3", "name": "Old Plain Stream", "url_resolved": "http://insecure.example.org/a", "geo_lat": 32.7, "geo_long": -96.8, "lastcheckok": 1},
        ]
        ccl = 'CALLSIGN[0] = "KEC56";\nSITENAME[0] = "Dallas";\nSITESTATE[0] = "TX";\nFREQ[0] = "162.400";\nSTATUS[0] = "Normal";\nLAT[0] = "32.78";\nLON[0] = "-96.80";\n'
        self.page.route("**/json/stations/search*", lambda r: r.fulfill(body=json.dumps(stations), content_type="application/json"))
        self.page.route("**/source/nwr/JS/CCL.js", lambda r: r.fulfill(body=ccl, content_type="text/javascript"))
        self.page.route("**/stream.example.org/**", lambda r: r.fulfill(body=buf.getvalue(), content_type="audio/wav"))
        wx_alerts = {"features": [{"properties": {"id": "w1", "event": "Wind Advisory", "headline": "Wind Advisory until 6 PM CST", "description": "South winds 20 to 30 mph."}}]}
        self.page.route("**/api.weather.gov/alerts/active?status=actual&point=*", lambda r: r.fulfill(body=json.dumps(wx_alerts), content_type="application/geo+json"))
        self.page.route("**/api.weather.gov/points/*", lambda r: r.fulfill(body=json.dumps({"properties": {"forecast": "https://api.weather.gov/gridpoints/FWD/80,108/forecast"}}), content_type="application/geo+json"))
        self.page.route("**/api.weather.gov/gridpoints/**", lambda r: r.fulfill(body=json.dumps({"properties": {"periods": [{"name": "Today", "detailedForecast": "Sunny and windy, with a high near 74."}]}}), content_type="application/geo+json"))
        self.context.grant_permissions(["geolocation"])
        self.context.set_geolocation({"latitude": 32.78, "longitude": -96.80})
        self.page.click("#bEmg")
        self.page.click("[data-em=yes]")
        # The nearest weather-radio frequency, and local stations with news first; only https streams.
        self.page.wait_for_function("() => /162.400 MHz/.test(document.getElementById('emgp').textContent)", timeout=8000)
        self.page.wait_for_selector("#emgp .rprow", timeout=8000)
        # What the weather radio reads, as the National Weather Service's own text.
        self.page.wait_for_function("() => /Sunny and windy, with a high near 74/.test(document.getElementById('emgp').textContent)", timeout=8000)
        self.assertIn("Wind Advisory until 6 PM CST", self.page.inner_text("#emgp .rptext"))
        names = self.page.locator("#emgp .rprow b").all_inner_texts()
        self.assertEqual(names, ["KERA News", "Hits 98"])
        # It plays right here, keeps playing with the panel closed, and stops from the bar.
        self.page.click("#emgp [data-em='rp-0']")
        self.page.wait_for_selector("#radiobar", state="visible", timeout=3000)
        self.assertIn("KERA NEWS", self.page.inner_text("#radiobar"))
        self.page.click("#emgp [data-em='hide']")
        self.assertTrue(self.visible("#radiobar"))
        self.page.click("#radiobar button")
        self.assertFalse(self.visible("#radiobar"))
        self.assertEqual(self.errors, [])

    def test_an_official_alert_for_my_position_takes_over_the_screen_once(self):
        alerts = {"features": [
            {"properties": {"id": "urn:a1", "event": "Tornado Warning", "severity": "Extreme", "urgency": "Immediate",
                            "senderName": "NWS Fort Worth TX", "areaDesc": "Dallas, TX; Tarrant, TX",
                            "headline": "Tornado Warning issued for Dallas County",
                            "instruction": "TAKE COVER NOW! Move to a basement or an interior room."}},
            {"properties": {"id": "urn:a2", "event": "Wind Advisory", "severity": "Moderate", "urgency": "Expected"}},
            {"properties": {"id": "urn:a3", "event": "Required Weekly Test", "severity": "Extreme", "urgency": "Immediate"}},
        ]}
        self.page.route(
            "**/api.weather.gov/alerts/active?status=actual&point=*",
            lambda r: r.fulfill(body=json.dumps(alerts), content_type="application/geo+json"),
        )
        self.context.grant_permissions(["geolocation"])
        self.context.set_geolocation({"latitude": 32.78, "longitude": -96.80})
        self.page.reload()
        self.page.wait_for_selector("#alertpop", state="visible", timeout=12000)
        text = self.page.inner_text("#alertpop")
        self.assertIn("Tornado Warning", text)
        self.assertIn("TAKE COVER NOW", text)
        self.assertIn("NWS FORT WORTH TX", text)
        self.page.click("#alertpop [data-am='ok']")
        self.page.wait_for_timeout(600)
        # Only the alert that calls for action was shown, and it doesn't come back.
        self.assertFalse(self.visible("#alertpop"))
        self.page.reload()
        self.page.wait_for_timeout(6000)
        self.assertFalse(self.visible("#alertpop"))
        self.assertEqual(self.errors, [])

    def test_settings_can_show_a_test_alert_and_turn_alerts_off(self):
        self.use_dashboard()
        self.page.reload()
        self.page.wait_for_selector("#rwdash .rwdock [data-rw='set']", state="visible", timeout=8000)
        self.page.click("#rwdash .rwdock [data-rw='set']")
        self.page.click("[data-br='amtest']")
        self.page.wait_for_selector("#alertpop", state="visible", timeout=3000)
        self.assertIn("TEST · NOT A REAL ALERT", self.page.inner_text("#alertpop"))
        self.page.click("#alertpop [data-am='ok']")
        self.page.click("#rwdash .rwdock [data-rw='set']")
        self.page.click("[data-br='am']")
        self.assertFalse(self.page.evaluate("() => JSON.parse(localStorage.getItem('ojos-set')).alertMe"))
        self.assertEqual(self.errors, [])

    def test_transit_layer_shows_vehicles_near_a_covered_city(self):
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({transit: true}))"
        )
        self.page.reload()
        self.page.wait_for_timeout(SETTLE_MS)
        self.page.fill("#addr", "Boston")
        self.page.press("#addr", "Enter")
        # The layer refreshes on a 10-second cycle, so allow one full cycle.
        self.page.wait_for_function(
            "() => (document.getElementById('wlayers') || {}).textContent.includes('2 · MBTA')",
            timeout=20000,
        )
        self.assertEqual(self.errors, [])

    def test_emergency_layers_show_storms_and_space_weather(self):
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({storm: true, space: true}))"
        )
        self.page.reload()
        self.page.wait_for_function(
            """() => {
                const t = (document.getElementById('wlayers') || {}).textContent || '';
                return t.includes('KP 5.3') && /Hurricanes & tropical storms\\s*1/.test(t);
            }""",
            timeout=20000,
        )
        self.assertEqual(self.errors, [])

    def test_border_wait_times_place_ports_from_the_bundled_table(self):
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({border: true}))"
        )
        self.page.reload()
        self.page.wait_for_function(
            "() => /Border wait times\\s*1/.test((document.getElementById('wlayers') || {}).textContent)",
            timeout=20000,
        )
        self.assertEqual(self.errors, [])

    def test_traffic_incidents_load_near_a_covered_city(self):
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({traffic: true}))"
        )
        self.page.reload()
        self.page.wait_for_timeout(SETTLE_MS)
        self.page.fill("#addr", "Austin")
        self.page.press("#addr", "Enter")
        # Info layers refresh on a 15-second cycle.
        self.page.wait_for_function(
            "() => /Traffic incidents & work zones\\s*1/.test((document.getElementById('wlayers') || {}).textContent)",
            timeout=25000,
        )
        self.assertEqual(self.errors, [])

    def test_internet_outages_and_weather_radio_load(self):
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({outages: true, nwr: true}))"
        )
        self.page.reload()
        self.page.wait_for_function(
            """() => {
                const t = (document.getElementById('wlayers') || {}).textContent || '';
                return /Internet outages\\s*1/.test(t) && /NOAA Weather Radio\\s*1/.test(t);
            }""",
            timeout=20000,
        )
        self.assertEqual(self.errors, [])

    def test_smoke_and_fire_layers_load(self):
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({smoke: true, firehot: true}))"
        )
        self.page.reload()
        self.page.wait_for_function(
            """() => {
                const t = (document.getElementById('wlayers') || {}).textContent || '';
                return /Wildfire smoke\\s*1/.test(t) && /Fire detections\\s*1/.test(t);
            }""",
            timeout=20000,
        )
        self.assertEqual(self.errors, [])

    def test_nasa_views_are_exclusive(self):
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({eo_today: true}))"
        )
        self.page.reload()
        self.page.wait_for_timeout(SETTLE_MS)
        self.page.evaluate(
            "() => { const b = document.createElement('button'); b.dataset.wl = 'eo_lights';"
            " document.body.appendChild(b); b.click(); b.remove(); }"
        )
        self.page.wait_for_timeout(1500)
        saved = self.page.evaluate(
            "() => JSON.parse(localStorage.getItem('ojos-layers'))"
        )
        self.assertTrue(saved.get("eo_lights"))
        self.assertFalse(saved.get("eo_today"))
        self.assertEqual(self.errors, [])

    def test_airport_delays_and_outbreaks_load(self):
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({airdelay: true, outbreaks: true}))"
        )
        self.page.reload()
        self.page.wait_for_function(
            """() => {
                const t = (document.getElementById('wlayers') || {}).textContent || '';
                return /Airport delays \\(US\\)\\s*1/.test(t) && /Disease outbreaks\\s*1/.test(t);
            }""",
            timeout=20000,
        )
        self.assertEqual(self.errors, [])

    def test_volcanoes_and_drought_load(self):
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({volcano: true, drought: true}))"
        )
        self.page.reload()
        self.page.wait_for_function(
            """() => {
                const t = (document.getElementById('wlayers') || {}).textContent || '';
                return /Volcanoes\\s*1/.test(t) && /Drought \\(US\\)\\s*1/.test(t);
            }""",
            timeout=20000,
        )
        self.assertEqual(self.errors, [])

    def test_starts_with_saved_settings_from_earlier_versions(self):
        # A returning user: a non-default map style and every layer switched on.
        self.page.add_init_script(
            """localStorage.setItem('ojos-set', JSON.stringify({style: 'dark'}));
            localStorage.setItem('ojos-layers', JSON.stringify(new Proxy({}, {})));"""
        )
        self.page.reload()
        self.page.wait_for_timeout(SETTLE_MS)
        all_on = self.page.evaluate(
            "() => Array.from(document.querySelectorAll('#wlayers [data-wl]')).map(b => b.dataset.wl)"
        )
        self.assertGreater(len(all_on), 50)
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify(Object.fromEntries(%s.map(k => [k, true]))))"
            % json.dumps(all_on)
        )
        self.page.reload()
        self.page.wait_for_timeout(SETTLE_MS * 2)
        self.assertEqual(self.errors, [])
        rendered = self.page.evaluate(
            "() => document.querySelectorAll('#wlayers [data-wl]').length"
        )
        self.assertEqual(rendered, len(all_on))

    def test_undersea_cables_load(self):
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({cables: true}))"
        )
        self.page.reload()
        self.page.wait_for_function(
            "() => /Undersea cables\\s*1/.test((document.getElementById('wlayers') || {}).textContent)",
            timeout=25000,
        )
        self.assertEqual(self.errors, [])

    def test_no_saved_setting_can_bring_back_the_old_screen(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        for look in ("classic", "earth", "replica", "clear"):
            self.page.evaluate(
                "(l) => localStorage.setItem('ojos-set', JSON.stringify({look: l, lookV: 4, rw3d: 'photo'}))",
                look,
            )
            self.page.reload()
            self.page.wait_for_function(
                "() => document.body.classList.contains('rw-canvas')", timeout=8000
            )
            self.page.wait_for_function(
                "() => localStorage.getItem('ojos-boot') === JSON.stringify('ok')", timeout=5000
            )
            self.assertFalse(self.visible(".hud"))
            saved = self.page.evaluate("() => JSON.parse(localStorage.getItem('ojos-set'))")
            self.assertNotIn("look", saved)
            self.assertNotIn("rw3d", saved)
        # Nothing 3D is loaded for the dashboard.
        self.assertFalse(self.page.evaluate("() => !!window.Cesium"))
        self.assertEqual(self.errors, [])

    def tap_logo(self, times=1):
        for _ in range(times):
            self.page.click(".brand", force=True)
            self.page.wait_for_timeout(60)

    def test_starts_on_the_smooth_globe_zooms_into_the_map_and_the_logo_opens_the_sky(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.reload()
        self.open_map()
        self.page.wait_for_function("() => window.__ml.layers.includes('cams')", timeout=15000)
        style = self.page.evaluate("() => window.__ml.style")
        ids = [layer["id"] for layer in style["layers"]]
        for layer_id in (
            "borders",
            "borders-glow",
            "place-country",
            "place-city",
            "road-name",
        ):
            self.assertIn(layer_id, ids)
        self.assertEqual(style["projection"], {"type": "mercator"})
        self.assertNotIn("sky", style, "the atmosphere flashed the screen on some phones")
        for layer in style["layers"]:
            self.assertNotIn(None, layer.values(), layer["id"])
        self.assertIn("camlabel", self.page.evaluate("() => window.__ml.layers"))
        self.assertEqual(self.page.inner_text("#rwname"), "OJOS DE DIOS")
        # One tap on the logo opens the sky; closing it returns to the same globe.
        self.page.click(".rwbrand")
        self.page.wait_for_selector("#sky", state="visible", timeout=3000)
        self.page.click("[data-sky='x']")
        self.assertTrue(
            self.page.evaluate("() => document.body.classList.contains('rw-globe')")
        )
        self.assertFalse(self.page.evaluate("() => !!window.Cesium"))
        self.assertEqual(self.errors, [])

    def test_dark_globe_that_never_draws_falls_back_then_keeps_retrying(self):
        self.use_dashboard()
        # A map engine that loads but never draws (a black screen on a phone).
        self.page.add_init_script(
            MAPLIBRE_STANDIN.replace("setTimeout(() => (this.h.load", "(() => (this.h.noload")
        )
        self.page.add_init_script("window.__OPS_WAIT_MS = 1500; window.__OPS_RETRY_MS = 1000;")
        self.page.reload()
        # Zooming in from the Smooth globe asks for the map, which never draws.
        self.page.wait_for_function("() => document.body.classList.contains('rw-canvas')", timeout=8000)
        self.page.wait_for_timeout(1700)
        self.page.mouse.move(195, 420)
        for _ in range(8):
            self.page.mouse.wheel(0, -500)
            self.page.wait_for_timeout(60)
        self.page.wait_for_function(
            "() => document.body.classList.contains('rw-canvas') && !document.body.classList.contains('tilt')"
            " && [...document.querySelectorAll('.toast')].some((t) => /switch back by itself/.test(t.textContent))",
            timeout=8000,
        )
        self.assertTrue(self.visible("#gl"))
        self.assertTrue(self.visible("#rwdash .rwdock"))
        # The fallback doesn't stick: the dark globe is tried again by itself.
        self.page.wait_for_function(
            "() => JSON.parse(localStorage.getItem('ojos-errs') || '[]').some((x) => /Dark globe/.test(x.m) && x.n >= 2)",
            timeout=10000,
        )
        self.assertFalse(self.visible(".hud"))
        self.assertEqual(self.errors, [])

    def test_a_start_that_never_drew_still_opens_the_dark_globe(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.add_init_script(
            "if (!sessionStorage.getItem('once')) { sessionStorage.setItem('once', '1');"
            " localStorage.setItem('ojos-boot', JSON.stringify('pending')); }"
        )
        self.page.reload()
        self.page.wait_for_function("() => document.body.classList.contains('rw-canvas')", timeout=8000)
        self.page.wait_for_function("() => localStorage.getItem('ojos-boot') === JSON.stringify('ok')", timeout=5000)
        self.assertEqual(self.errors, [])

    def test_globe_recovers_when_the_phone_takes_its_graphics_away(self):
        lost = self.page.evaluate("""() => {
                const gl = document.getElementById('gl').getContext('webgl');
                const ext = gl && gl.getExtension('WEBGL_lose_context');
                if (!ext) return false;
                ext.loseContext();
                window.__restore = () => ext.restoreContext();
                return true;
            }""")
        if not lost:
            self.skipTest("this browser can't simulate lost graphics")
        self.page.wait_for_function(
            "() => /Globe graphics/.test(localStorage.getItem('ojos-errs') || '')",
            timeout=5000,
        )
        self.page.wait_for_timeout(2500)
        recovered = self.page.evaluate(
            "() => { const gl = document.getElementById('gl').getContext('webgl'); return !!gl && !gl.isContextLost(); }"
        )
        self.assertTrue(recovered)
        self.assertEqual(self.errors, [])

    def test_dark_globe_draws_data_layers_and_opens_them(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({cables: true, border: true}))"
        )
        self.page.reload()
        self.open_map()
        self.page.wait_for_function(
            "() => window.__ml && window.__ml.sources.info && window.__ml.sources.infoline"
            " && window.__ml.sources.infoline.data.features.length >= 1"
            " && window.__ml.sources.info.data.features.length >= 1",
            timeout=40000,
        )
        self.assertEqual(self.errors, [])

    def test_cameras_from_the_last_session_show_at_once(self):
        self.page.evaluate("""() => new Promise((res) => {
                const r = indexedDB.open('ojos', 1);
                r.onupgradeneeded = () => r.result.createObjectStore('kv');
                r.onsuccess = () => {
                    const tx = r.result.transaction('kv', 'readwrite');
                    const cams = [1, 2, 3].map((i) => ({
                        n: 'Cam ' + i, lat: 30 + i, lon: -97, e: 'https://example.org/' + i + '.jpg',
                        src: 'Saved network', live: true,
                    }));
                    tx.objectStore('kv').put({ t: Date.now(), cams }, 'live-snap');
                    tx.oncomplete = res;
                };
            })""")
        self.page.reload()
        self.page.wait_for_function(
            "() => +document.getElementById('kLive').textContent.replace(/\\D/g, '') >= 3",
            timeout=5000,
        )
        self.assertEqual(self.errors, [])

    def test_shared_feed_fills_cameras_at_start(self):
        feed = {
            "v": 1,
            "t": int(time.time() * 1000),
            "srcs": ["Feed network"],
            "keys": ["n", "lat", "lon", "e"],
            "rows": [
                [0, "Feed cam %d" % i, 40 + i, -100, "https://example.org/%d.jpg" % i]
                for i in range(4)
            ],
        }
        self.page.route(
            "**/dios-prototype.civ/data/cams.json*",
            lambda r: r.fulfill(body=json.dumps(feed), content_type="application/json"),
        )
        self.page.reload()
        self.page.wait_for_function(
            "() => +document.getElementById('kLive').textContent.replace(/\\D/g, '') >= 4",
            timeout=6000,
        )
        self.assertEqual(self.errors, [])

    def test_photo_help_is_in_emergency_and_where_is_this_explains_the_key(self):
        self.page.evaluate("() => document.getElementById('bEmg').click()")
        self.page.click("[data-em='yes']")
        self.page.wait_for_selector(
            "#emgp [data-ph='help']", state="visible", timeout=8000
        )
        self.page.evaluate(
            "() => { const b = document.createElement('button'); b.dataset.ph = 'where';"
            " document.body.appendChild(b); b.click(); }"
        )
        self.page.wait_for_selector("#php", state="visible", timeout=3000)
        text = self.page.inner_text("#php")
        self.assertIn("Cloud Vision", text)
        self.assertIn("never looked up", text)
        self.page.click("[data-ph='x']")
        self.assertFalse(self.visible("#php"))
        self.assertEqual(self.errors, [])

    def test_conflict_panel_lists_reports_from_the_feed(self):
        now = int(time.time() * 1000)
        items = [
            {
                "id": "conflict:%d" % i,
                "kind": "info",
                "layer": "conflict",
                "lat": 48 + i,
                "lon": 36,
                "n": kind + " · Place %d" % i,
                "color": "#ff3b6b",
                "tag": "UNVERIFIED NEWS REPORT",
                "t": now - i * 60000,
                "rows": [["TYPE", kind]],
                "links": [["Read the report", "https://example.org/%d" % i]],
            }
            for i, kind in enumerate(["Drone strike", "Air strike", "Drone strike"])
        ]
        feed = {"v": 1, "t": now, "layers": {"conflict": {"t": now, "items": items}}}
        self.page.route(
            "**/dios-prototype.civ/data/layers.json*",
            lambda r: r.fulfill(body=json.dumps(feed), content_type="application/json"),
        )
        mil = {"ac": [
            {"hex": "ae1234", "flight": "FORTE11 ", "t": "GLHK", "desc": "NORTHROP GRUMMAN RQ-4 Global Hawk", "lat": 43.1, "lon": 33.2, "alt_baro": 52000, "gs": 330},
            {"hex": "ae5678", "flight": "RCH401", "t": "C17", "lat": 50.0, "lon": 8.6, "alt_baro": 31000, "gs": 450},
        ]}
        self.page.route(
            "**/api.adsb.lol/v2/mil*",
            lambda r: r.fulfill(body=json.dumps(mil), content_type="application/json"),
        )
        self.use_dashboard()
        self.page.reload()
        self.page.wait_for_selector(
            "#rwdash .rwdock [data-rw='conflict']", state="visible", timeout=8000
        )
        self.assertFalse(self.visible(".hud"))
        self.page.click("#rwdash .rwdock [data-rw='conflict']")
        self.page.wait_for_function(
            "() => document.querySelectorAll('#cfp .cfrow').length === 3", timeout=8000
        )
        self.assertIn("UNVERIFIED", self.page.inner_text("#cfp").upper())
        self.page.click("#cfp [data-cf='k-Drone strike']")
        self.assertEqual(self.page.locator("#cfp .cfrow").count(), 2)
        # Military aircraft from public ADS-B, with the drone picked out.
        self.page.wait_for_function(
            "() => /2 MILITARY AIRCRAFT · 1 DRONE/.test(document.querySelector('#cfp .cfhead').textContent)", timeout=8000
        )
        self.page.click("#cfp .cfrow >> nth=0")
        self.assertFalse(self.visible("#cfp"))
        # ▦ on a report opens the public cameras around that place.
        self.page.click("#rwdash .rwdock [data-rw='conflict']")
        self.page.click("#cfp .cfcam >> nth=0")
        self.page.wait_for_selector("#cgp", state="visible", timeout=3000)
        self.assertFalse(self.visible("#cfp"))
        self.assertEqual(self.errors, [])

    def test_camera_grid_shows_tiles_that_grow_and_shrink(self):
        self.page.wait_for_function("() => +document.getElementById('kLive').textContent.replace(/\\D/g, '') >= 3", timeout=10000)
        # The world view, so every loaded camera is in the area.
        self.page.evaluate(
            "() => { const b = document.createElement('button'); b.dataset.rw = 'cams';"
            " document.body.appendChild(b); b.click(); }"
        )
        self.page.wait_for_selector("#cgp", state="visible", timeout=3000)
        self.page.wait_for_function("() => /CAMERAS|NO LIVE/.test(document.getElementById('cgsub').textContent)", timeout=5000)
        n = self.page.locator("#cggrid .cgt").count()
        # One screenful per page: the tiles fit without scrolling, and the pager turns pages.
        self.assertTrue(self.page.evaluate("() => { const g = document.getElementById('cggrid'); return g.scrollHeight <= g.clientHeight + 2; }"))
        self.assertEqual(self.page.locator("#cgp .cgpager").count(), 1)
        if n:
            first = self.page.locator("#cggrid .cgt").first
            first.click()
            self.assertIn("big", first.get_attribute("class"))
            self.assertTrue(self.visible("#cggrid .cgt.big .cgopen"))
            first.click(position={"x": 10, "y": 10})
            self.assertNotIn("big", first.get_attribute("class"))
        # Drive opens from the grid's ➤ button.
        self.page.click("#cgp [data-cg='drive']")
        self.page.wait_for_selector("#drvForm", state="visible", timeout=3000)
        self.assertFalse(self.visible("#cgp"))
        self.assertEqual(self.errors, [])

    def test_a_camera_grid_can_be_saved_and_reopened_with_one_tap(self):
        self.page.wait_for_function("() => +document.getElementById('kLive').textContent.replace(/\\D/g, '') >= 3", timeout=10000)
        open_grid = (
            "() => { const b = document.createElement('button'); b.dataset.rw = 'cams';"
            " document.body.appendChild(b); b.click(); b.remove(); }"
        )
        self.page.evaluate(open_grid)
        self.page.wait_for_selector("#cgp .cgsave", state="visible", timeout=5000)
        self.assertIn("SAVE AREA 1", self.page.inner_text("#cgp .cgsave"))
        self.page.click("#cgp .cgsave")
        self.assertEqual(self.page.locator("#cgp .cgchip").count(), 1)
        self.assertFalse(self.visible("#cgp .cgsave"), "an already saved grid offers no second save")
        self.page.click("#cgp [data-cg='x']")
        # It survives a restart and comes back with one tap.
        self.page.reload()
        self.page.wait_for_function("() => +document.getElementById('kLive').textContent.replace(/\\D/g, '') >= 3", timeout=10000)
        self.page.evaluate(open_grid)
        self.page.wait_for_selector("#cgp .cgchip", state="visible", timeout=5000)
        self.page.fill("#cgq", "")
        self.page.click("#cgp [data-cg='sv-0']")
        self.page.wait_for_function("() => /CAMERAS · /.test(document.getElementById('cgsub').textContent)", timeout=5000)
        self.assertEqual(self.page.input_value("#cgq"), "Area 1")
        self.assertGreater(self.page.locator("#cggrid .cgt").count(), 0)
        # Removing it.
        self.page.click("#cgp [data-cg='del-0']")
        self.assertEqual(self.page.locator("#cgp .cgchip").count(), 0)
        self.assertEqual(self.errors, [])

    def test_alerts_for_a_saved_place_reach_me_wherever_i_am(self):
        self.page.route(
            "**/nominatim.openstreetmap.org/search?format=json&limit=1&q=Austin*",
            lambda r: r.fulfill(body=json.dumps([{"lat": "30.2672", "lon": "-97.7431", "display_name": "Austin, Texas"}]), content_type="application/json"),
        )
        tornado = {"features": [{"properties": {"id": "urn:austin", "event": "Tornado Warning", "severity": "Extreme", "urgency": "Immediate", "headline": "Tornado Warning for Travis County"}}]}
        self.page.route(
            "**/api.weather.gov/alerts/active?status=actual&point=30.2672,-97.7431",
            lambda r: r.fulfill(body=json.dumps(tornado), content_type="application/geo+json"),
        )
        self.use_dashboard()
        self.page.reload()
        self.page.wait_for_selector("#rwdash .rwdock [data-rw='set']", state="visible", timeout=8000)
        self.page.click("#rwdash .rwdock [data-rw='set']")
        self.page.fill("#amQ", "Austin")
        self.page.fill("#amN", "Mom")
        self.page.fill("#amP", "(214) 555-0100")
        self.page.click("#amForm button")
        self.page.wait_for_selector("#brief .amplaces span", timeout=5000)
        self.assertIn("Mom", self.page.inner_text("#brief .amplaces"))
        self.page.wait_for_selector("#alertpop", state="visible", timeout=8000)
        self.assertIn("FOR MOM", self.page.inner_text("#alertpop"))
        # A ready text to check on her.
        sms = self.page.get_attribute("#alertpop .amsms", "href")
        self.assertTrue(sms.startswith("sms:2145550100?body=Are%20you%20OK%3F"), sms)
        self.page.click("#alertpop [data-am='ok']")
        # It is kept under Recent alerts and opens again from there.
        self.page.wait_for_function("() => /Tornado Warning/.test((document.querySelector('#brief .amhist') || {}).textContent || '')", timeout=3000)
        self.assertIn("Mom", self.page.inner_text("#brief .amhist"))
        self.page.click("#brief [data-br='amh-0']")
        self.page.wait_for_selector("#alertpop", state="visible", timeout=3000)
        self.assertIn("FOR MOM", self.page.inner_text("#alertpop"))
        self.page.click("#alertpop [data-am='ok']")
        self.page.click("#rwdash .rwdock [data-rw='set']")
        # Removing the place (Settings is still open underneath).
        self.page.click("#brief [data-br='amrm-0']")
        self.assertEqual(self.page.locator("#brief .amplaces span").count(), 0)
        self.assertEqual(self.errors, [])

    def test_a_saved_place_map_can_be_kept_for_use_without_signal(self):
        self.page.route(
            "**/tiles.openfreemap.org/planet",
            lambda r: r.fulfill(body=json.dumps({"tiles": ["https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf"]}), content_type="application/json"),
        )
        self.page.route("**/tiles.openfreemap.org/planet/v1/**", lambda r: r.fulfill(body=b"\x1a\x00", content_type="application/x-protobuf"))
        self.page.route("**/tiles.openfreemap.org/fonts/**", lambda r: r.fulfill(body=b"\x0a\x00", content_type="application/x-protobuf"))
        self.page.route("**/cdn.jsdelivr.net/npm/**atlas**", lambda r: r.fulfill(body="{}", content_type="application/json"))
        self.page.add_init_script(
            "localStorage.setItem('ojos-alerts', JSON.stringify({places: [{name: 'Home', lat: 32.78, lon: -96.8}]}))"
        )
        self.use_dashboard()
        self.page.reload()
        self.page.wait_for_selector("#rwdash .rwdock [data-rw='set']", state="visible", timeout=8000)
        self.page.click("#rwdash .rwdock [data-rw='set']")
        self.page.click("#brief [data-br='ampk-0']")
        self.page.wait_for_function("() => /✓ OFFLINE/.test(document.querySelector('#brief .amplaces').textContent)", timeout=20000)
        kept = self.page.evaluate("() => caches.open('ojos-tiles').then((c) => c.keys()).then((k) => k.map((r) => r.url))")
        self.assertTrue(any("/planet/v1/14/" in u for u in kept), "street-level tiles")
        self.assertTrue(any("/fonts/" in u for u in kept), "fonts for the names")
        self.assertTrue(any("states-10m" in u for u in kept), "borders for the Smooth globe")
        self.assertEqual(self.errors, [])

    def test_map_pins_float_the_nearest_cameras_beside_their_spots(self):
        self.page.wait_for_function("() => +document.getElementById('kLive').textContent.replace(/\\D/g, '') >= 3", timeout=10000)
        self.page.evaluate(
            "() => { const b = document.createElement('button'); b.dataset.rw = 'cams';"
            " document.body.appendChild(b); b.click(); b.remove(); }"
        )
        self.page.wait_for_selector("#cggrid .cgt", timeout=5000)
        self.page.locator("#cggrid .cgt").first.click()
        self.page.click("#cggrid .cgt.big .cgweb")
        self.page.wait_for_selector("#cpins", state="visible", timeout=3000)
        self.assertFalse(self.visible("#cgp"))
        self.page.wait_for_timeout(2500)
        shown = self.page.locator("#cpins .cpt:visible").count()
        self.assertGreaterEqual(shown, 3)
        # Every visible tile has a line to its spot, and no two tiles overlap.
        self.assertEqual(self.page.locator("#cpins .cplines line").count(), shown)
        overlap = self.page.evaluate(
            """() => { const r = [...document.querySelectorAll('#cpins .cpt')].filter((e) => e.style.display === 'block').map((e) => e.getBoundingClientRect());
            for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
              const a = r[i], b = r[j];
              if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) return true; }
            return false; }"""
        )
        self.assertFalse(overlap)
        self.assertRegex(self.page.inner_text("#cpins .cpt:not(.mid) em >> nth=0"), r"(MI|FT)$")
        # Tapping a tile enlarges it where it is; tapping again shrinks it back.
        t = self.page.locator("#cpins .cpt:not(.mid):visible").first
        w0 = t.bounding_box()["width"]
        t.click(position={"x": 10, "y": 10})
        self.page.wait_for_timeout(400)
        self.assertGreater(t.bounding_box()["width"], w0 * 1.8)
        self.assertTrue(self.visible("#cpins .cpt.big .cpopen"))
        t.click(position={"x": 10, "y": 10})
        self.page.wait_for_timeout(400)
        self.assertLess(t.bounding_box()["width"], w0 * 1.2)
        # Dragging a tile moves it, and it stays where it was put; a drag is not a tap.
        b0 = t.bounding_box()
        self.page.mouse.move(b0["x"] + 12, b0["y"] + 12)
        self.page.mouse.down()
        for k in range(1, 6):
            self.page.mouse.move(b0["x"] + 12 - 14 * k, b0["y"] + 12 + 24 * k)
        self.page.mouse.up()
        self.page.wait_for_timeout(600)
        b1 = t.bounding_box()
        self.assertAlmostEqual(b1["y"] - b0["y"], 120, delta=12)
        self.assertAlmostEqual(b1["x"] - b0["x"], -70, delta=12)
        self.assertLess(b1["width"], w0 * 1.2, "the drag did not enlarge it")
        self.page.click("#cpins [data-cp='x']")
        self.assertFalse(self.visible("#cpins"))
        self.assertEqual(self.errors, [])

    def test_zooming_into_a_city_shows_the_camera_pins_by_themselves(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.reload()
        self.open_map()
        self.page.wait_for_function("() => +document.getElementById('kLive').textContent.replace(/\\D/g, '') >= 3", timeout=10000)
        self.assertFalse(self.visible("#cpins"), "not from far out")
        # Zoomed into Yellowstone, by Mount Washburn's camera.
        self.page.evaluate("() => { __mlMap.z = 13; __mlMap.c = { lng: -110.44, lat: 44.80 }; }")
        self.page.wait_for_selector("#cpins", state="visible", timeout=4000)
        self.assertIn("CAMERAS HERE", self.page.inner_text("#cpname"))
        self.assertIn("WASHBURN", self.page.inner_text("#cpname").upper())
        # The map was not moved for them.
        self.assertEqual(self.page.evaluate("() => __mlMap.c.lng"), -110.44)
        # Zooming back out takes them away.
        self.page.evaluate("() => { __mlMap.z = 5; }")
        self.page.wait_for_selector("#cpins", state="hidden", timeout=4000)
        self.assertEqual(self.errors, [])

    def test_a_tap_near_an_object_circles_it_then_select_opens_it(self):
        quakes = {"type": "FeatureCollection", "features": [
            {"type": "Feature", "id": "us7000test", "properties": {"mag": 4.6, "place": "near Ridgecrest, CA", "time": 1763300000000},
             "geometry": {"type": "Point", "coordinates": [-117.6, 35.7, 8]}},
        ]}
        self.page.route(
            "**/earthquakes/feed/v1.0/summary/*",
            lambda r: r.fulfill(body=json.dumps(quakes), content_type="application/json", headers={"access-control-allow-origin": "*"}),
        )
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.reload()
        self.open_map()
        self.page.evaluate("() => { __mlMap.z = 9; }")
        self.page.wait_for_function(
            "() => __ml.sources.world && __ml.sources.world.data.features.length", timeout=10000
        )
        # The map answers for whatever is drawn near the tap, as MapLibre does.
        pt = self.page.evaluate(
            """() => { const f = __ml.sources.world.data.features[0], c = f.geometry.coordinates;
            __mlMap.c = { lng: c[0], lat: c[1] };
            __mlMap.queryRenderedFeatures = (g, o) => (o && o.layers && o.layers[0] === 'world' && Array.isArray(g[0]) ? [f] : []);
            const q = __mlMap.project(c); return { x: q.x + 22, y: q.y + 18 }; }"""
        )
        # A tap that misses by a finger's width still catches it, and only circles it.
        self.page.evaluate("(p) => __mlMap.h.click.forEach((f) => f({ point: p }))", pt)
        self.page.wait_for_selector("#tring.on .trchip", timeout=3000)
        name = self.page.inner_text("#tring .trchip b")
        self.assertTrue(self.visible("#tring [data-tr='sel']"))
        self.assertTrue(self.visible("#tring [data-tr='x']"))
        # Deselect lets it go; tapping again and Select opens its details.
        self.page.click("#tring [data-tr='x']")
        self.assertFalse(self.visible("#tring .trchip"))
        self.page.evaluate("(p) => __mlMap.h.click.forEach((f) => f({ point: p }))", pt)
        self.page.click("#tring [data-tr='sel']")
        self.assertFalse(self.visible("#tring .trchip"))
        self.assertIn(name[:12], self.page.inner_text("#detail h3").upper())
        self.assertEqual(self.errors, [])

    def test_outside_links_open_as_the_apps_own_screen(self):
        article = (
            "<html><head><title>Bridge record</title><meta property='og:site_name' content='State Records'>"
            "<script>window.__ran = 1</script><style>p{color:red}</style></head><body>"
            "<nav class='menu'><a href='/a'>Home</a> <a href='/b'>About</a></nav>"
            "<article><h1>Bridge record</h1>"
            + "".join(
                "<p onclick='window.__ran=2'>Paragraph %d about the bridge, its builders, its repairs, and the river below it, written out in full.</p>" % i
                for i in range(6)
            )
            + "<h2>Inspections</h2><ul><li>2019: welds flagged</li><li>2026: closed</li></ul>"
            "<p>More in <a href='https://example.org/next'>the next record</a>, which continues the story at length.</p>"
            "<iframe src='https://example.org/ad'></iframe><form><input></form></article>"
            "<footer>Copyright footer text</footer></body></html>"
        )
        nxt = "<html><head><title>Next record</title></head><body><main>" + "<p>The next record carries on with plenty more words about the same bridge and river.</p>" * 6 + "</main></body></html>"
        self.page.route("https://example.org/record", lambda r: r.fulfill(body=article, content_type="text/html", headers={"access-control-allow-origin": "*"}))
        self.page.route("https://example.org/next", lambda r: r.fulfill(body=nxt, content_type="text/html", headers={"access-control-allow-origin": "*"}))
        self.page.evaluate(
            "() => { const a = document.createElement('a'); a.href = 'https://example.org/record';"
            " a.target = '_blank'; a.id = 'outl'; a.textContent = '↗ Official record'; document.body.appendChild(a); }"
        )
        pages = len(self.page.context.pages)
        self.page.evaluate("() => document.getElementById('outl').click()")
        self.page.wait_for_selector("#pgv .pgvcard h2", timeout=5000)
        self.assertEqual(len(self.page.context.pages), pages)
        self.assertIn("127.0.0.1", self.page.url)
        # The article is rebuilt in the app's own card: no frames, no page scripts, no menus or footers.
        self.assertEqual(self.page.locator("#pgv iframe, #pgv form, #pgv script, #pgv style").count(), 0)
        self.assertEqual(self.page.inner_text("#pgv .pgvcard h2"), "Bridge record")
        self.assertEqual(self.page.inner_text("#pgv .pgvcard .tag"), "STATE RECORDS")
        self.assertEqual(self.page.locator("#pgv .pgvcard p").count() >= 7, True)
        self.assertEqual(self.page.inner_text("#pgv .pgvcard h3"), "Inspections")
        body = self.page.inner_text("#pgv .pgvcard")
        self.assertNotIn("Copyright footer", body)
        self.assertNotIn("About", body)
        self.page.click("#pgv .pgvcard p >> nth=0")
        self.assertIsNone(self.page.evaluate("() => window.__ran"))
        # A link inside opens the next page in the same place, and ‹ comes back.
        self.page.click("#pgv .pgvcard a[href='https://example.org/next']")
        self.page.wait_for_function("() => document.querySelector('#pgv .pgvcard h2') && document.querySelector('#pgv .pgvcard h2').textContent === 'Next record'", timeout=5000)
        self.page.click("#pgv [data-pgv='b']")
        self.page.wait_for_function("() => document.querySelector('#pgv .pgvcard h2') && document.querySelector('#pgv .pgvcard h2').textContent === 'Bridge record'", timeout=5000)
        self.page.click("#pgv [data-pgv='x']")
        self.assertFalse(self.visible("#pgv"))
        # Pages asked for by code, and air traffic audio, open in the app too.
        self.page.evaluate("() => window.open('https://example.org/next', '_blank')")
        self.page.wait_for_selector("#pgv.on", timeout=3000)
        self.page.click("#pgv [data-pgv='x']")
        self.assertEqual(len(self.page.context.pages), pages)
        self.assertEqual(self.errors, [])

    def test_an_aircraft_in_emergency_is_announced_and_its_tower_screen_opens(self):
        J = "application/json"
        fix = {
            "**/api.adsb.lol/v2/point/**": {"ac": [{"hex": "a1b2c3", "flight": "SWA1234 ", "lat": 30.25, "lon": -97.68,
                                                   "alt_baro": 3000, "gs": 150, "track": 180, "squawk": "7700"}]},
            "**/api.adsbdb.com/v0/callsign/**": {"response": {"flightroute": {
                "airline": {"name": "Southwest"},
                "origin": {"iata_code": "AUS", "icao_code": "KAUS", "name": "Austin-Bergstrom", "municipality": "Austin", "latitude": 30.197, "longitude": -97.666},
                "destination": {"iata_code": "DAL", "icao_code": "KDAL", "name": "Dallas Love Field", "municipality": "Dallas", "latitude": 32.847, "longitude": -96.852}}}},
            "**/datis.clowd.io/api/KAUS": [{"airport": "KAUS", "type": "combined", "code": "C",
                                            "datis": "AUS ATIS INFO C 1453Z. 18010KT 10SM FEW040 23/14 A3001. ILS RWY 18L APCH IN USE."}],
            "**/aviationweather.gov/api/data/metar**": [{"icaoId": "KAUS", "rawOb": "KAUS 171453Z 18010KT 10SM FEW040 23/14 A3001",
                                                         "temp": 23, "wdir": 180, "wspd": 10, "visib": "10+", "fltCat": "VFR"}],
            "**/aviationweather.gov/api/data/taf**": [{"rawTAF": "TAF KAUS 171120Z 1712/1812 18012KT P6SM SCT040"}],
            "**/aviationweather.gov/api/data/pirep**": [{"rawOb": "AUS UA /OV AUS/TM 1440/FL050/TP B737/TB MOD", "obsTime": 1763390400, "airepType": "PIREP"}],
        }
        def answer(b):
            return lambda r: r.fulfill(body=json.dumps(b), content_type=J, headers={"access-control-allow-origin": "*"})
        for pat, body in fix.items():
            self.page.route(pat, answer(body))
        faa = ("<AIRPORT_STATUS_INFORMATION><Delay_type><Name>Ground Stop Programs</Name><Ground_Stop_List>"
               "<Program><ARPT>AUS</ARPT><Reason>thunderstorms</Reason><End_Time>4:00 pm CST</End_Time></Program>"
               "<Program><ARPT>SFO</ARPT><Reason>wind</Reason></Program></Ground_Stop_List></Delay_type></AIRPORT_STATUS_INFORMATION>")
        self.page.route("**/nasstatus.faa.gov/**", lambda r: r.fulfill(body=faa, content_type="text/xml", headers={"access-control-allow-origin": "*"}))
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({air: true}));"
            "Object.defineProperty(window, 'speechSynthesis', { value: { speak: (u) => { window.__said = u.text; }, cancel: () => {} } });"
        )
        self.page.reload()
        # The emergency code is announced; tapping the notice opens the aircraft.
        self.page.wait_for_selector(".toast:has-text('SQUAWKING 7700')", timeout=15000)
        self.assertIn("SWA1234", self.page.inner_text(".toast"))
        self.page.click(".toast:has-text('SQUAWKING 7700')")
        self.page.wait_for_selector("#detail [data-tower='o']", timeout=8000)
        self.assertIn("7700 · EMERGENCY", self.page.inner_text("#detail"))
        self.assertIn("TOWER · AUS", self.page.inner_text("#detail [data-tower='o']"))
        self.page.click("#detail [data-tower='o']")
        self.page.wait_for_selector("#pgv.on #tow-atis .towlet", timeout=8000)
        self.assertIn("KAUS", self.page.inner_text("#pgv .pgvbar b"))
        self.assertEqual(self.page.inner_text("#tow-atis .towlet"), "C")
        self.assertIn("INFORMATION CHARLIE", self.page.inner_text("#tow-atis"))
        self.page.wait_for_selector("#tow-faa .towwarn", timeout=5000)
        faa_text = self.page.inner_text("#tow-faa")
        self.assertIn("Ground Stop", faa_text)
        self.assertIn("thunderstorms", faa_text)
        self.assertNotIn("wind", faa_text)
        self.page.wait_for_selector("#tow-wx .towcat", timeout=5000)
        self.assertEqual(self.page.inner_text("#tow-wx .towcat"), "VFR")
        self.assertIn("TAF KAUS", self.page.inner_text("#tow-wx"))
        self.page.wait_for_selector("#tow-pirep .towrep", timeout=5000)
        self.assertIn("Add your AeroDataBox key", self.page.inner_text("#tow-board"))
        self.assertIn("SWA1234", self.page.inner_text("#tow-near"))
        # Listen reads the broadcast aloud, and pauses.
        self.page.click("[data-tow='play']")
        self.assertEqual(self.page.inner_text("[data-tow='play']"), "❚❚ PAUSE")
        said = self.page.evaluate("() => window.__said")
        self.assertIn("information Charlie", said)
        self.assertIn("runway 18 left", said)
        self.page.click("[data-tow='play']")
        self.assertEqual(self.page.inner_text("[data-tow='play']"), "▶ LISTEN")
        # A nearby aircraft opens on the map.
        self.page.click("#tow-near [data-towp='a1b2c3']")
        self.assertFalse(self.visible("#pgv"))
        self.assertIn("SWA1234", self.page.inner_text("#detail h3"))
        self.assertEqual(self.errors, [])

    def test_the_top_bar_keeps_every_count_readable(self):
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({air: true, ship: true}));"
            "localStorage.setItem('godeye-keys', JSON.stringify({ais: 'test-key'}));"
        )
        self.use_dashboard()
        self.page.reload()
        self.page.wait_for_selector("#rwdash .rwcount span", timeout=8000)
        self.page.wait_for_timeout(1200)
        self.page.wait_for_function("() => document.getElementById('rwdash').classList.contains('rwmany')", timeout=5000)
        fits = self.page.evaluate("() => { const c = document.getElementById('rwcount'); return c.scrollWidth <= c.clientWidth + 1; }")
        self.assertTrue(fits, "the counts are not cut off")
        self.assertEqual(self.errors, [])

    def test_highlight_circles_a_building_and_tells_its_story(self):
        osm = {"elements": [{"type": "way", "tags": {"building": "yes", "name": "Empire State Building", "height": "381", "building:levels": "102", "wikidata": "Q9188"},
                             "geometry": [{"lat": 40.7484, "lon": -73.9862}, {"lat": 40.7490, "lon": -73.9853}, {"lat": 40.7481, "lon": -73.9846}, {"lat": 40.7476, "lon": -73.9856}, {"lat": 40.7484, "lon": -73.9862}]}]}
        wd = {"entities": {"Q9188": {"labels": {"en": {"value": "Empire State Building"}}, "sitelinks": {"enwiki": {"title": "Empire State Building"}},
                                    "claims": {"P571": [{"mainsnak": {"datavalue": {"value": {"time": "+1930-03-17T00:00:00Z"}}}}],
                                               "P84": [{"mainsnak": {"datavalue": {"value": {"id": "Q1"}}}}]}}}}
        labels = {"entities": {"Q1": {"labels": {"en": {"value": "Shreve, Lamb & Harmon"}}}}}
        self.page.route("**/api/interpreter?data=*", lambda r: r.fulfill(body=json.dumps(osm), content_type="application/json"))
        self.page.route("**/www.wikidata.org/w/api.php?*", lambda r: r.fulfill(body=json.dumps(labels if "props=labels&" in r.request.url else wd), content_type="application/json"))
        self.page.route("**/en.wikipedia.org/api/rest_v1/page/summary/*", lambda r: r.fulfill(body=json.dumps({"title": "Empire State Building", "extract": "A 102-story Art Deco skyscraper in Midtown Manhattan."}), content_type="application/json"))
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.add_init_script(CESIUM_STANDIN)
        self.page.reload()
        self.open_map()
        self.page.wait_for_timeout(300)
        self.page.evaluate("() => { __mlMap.z = 15.5; (__mlMap.h.moveend || []).forEach((f) => f({})); }")
        self.page.click("#rw3d")
        self.page.wait_for_function("() => document.body.classList.contains('real')", timeout=5000)
        self.page.click("#t4bar [data-hl='go']")
        self.page.wait_for_function("() => /Art Deco skyscraper/.test((document.getElementById('hlcard') || {}).textContent || '')", timeout=8000)
        card = self.page.inner_text("#hlcard")
        self.assertIn("Empire State Building", card)
        self.assertIn("381 m · 1,250 ft", card)
        self.assertIn("1930", card)
        self.assertIn("Shreve, Lamb & Harmon", card)
        self.assertIn("102", card)
        self.page.click("#hlcard [data-hl='x']")
        self.assertFalse(self.visible("#hlcard"))
        self.assertEqual(self.errors, [])

    def test_moving_lists_aircraft_nearest_first_and_opens_one(self):
        ac = {"ac": [
            {"hex": "a1b2c3", "flight": "SWA1234 ", "lat": 30.25, "lon": -97.68, "alt_baro": 3000, "gs": 150, "track": 180, "t": "B737"},
            {"hex": "d4e5f6", "flight": "AAL22 ", "lat": 31.9, "lon": -97.1, "alt_baro": 31000, "gs": 450, "track": 20},
        ]}
        self.page.route("**/api.adsb.lol/v2/point/**", lambda r: r.fulfill(body=json.dumps(ac), content_type="application/json", headers={"access-control-allow-origin": "*"}))
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.add_init_script(
            "localStorage.setItem('ojos-layers', JSON.stringify({air: true, img: true}));"
            "localStorage.setItem('godeye-keys', JSON.stringify({ais: 'test-key'}));"
        )
        self.page.reload()
        self.open_map()
        self.page.evaluate("() => { __mlMap.c = { lng: -97.7, lat: 30.3 }; }")
        self.page.click("#rwdash .rwdock [data-rw='moving']")
        self.page.wait_for_selector("#mvp .mvrow", timeout=15000)
        names = self.page.locator("#mvp .mvgo b").all_inner_texts()
        self.assertEqual(names[:2], ["SWA1234", "AAL22"], "nearest the middle of the map first")
        self.assertIn("3,000 FT", self.page.inner_text("#mvp .mvrow >> nth=0"))
        # Ships only: none yet, and it offers to turn them on.
        self.page.click("#mvp [data-mv='f-ship']")
        self.assertTrue(self.visible("#mvp [data-mv='on-ship']"))
        self.page.click("#mvp [data-mv='f-plane']")
        # A tap flies there and opens its details.
        self.page.click("#mvp .mvgo >> nth=0")
        self.assertFalse(self.visible("#mvp"))
        self.page.wait_for_selector("#detail h3", timeout=5000)
        self.assertIn("SWA1234", self.page.inner_text("#detail h3"))
        self.assertEqual(self.page.locator("[data-ckp], #ckp, [data-mv^='pilot-'], [data-tr='pilot']").count(), 0)
        self.assertEqual(self.errors, [])

    def test_layers_follow_the_zoom(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.add_init_script("localStorage.setItem('ojos-layers', JSON.stringify({bikes: true, economy: true, img: true}));")
        self.page.reload()
        self.open_map()
        status = "(k) => document.querySelector(`#wlayers [data-wl='${k}']`).textContent"
        # A continent in view: the close-up layer waits, the worldwide one shows.
        self.page.evaluate("() => { __mlMap.z = 3.5; (__mlMap.h.moveend || []).forEach((f) => f({})); }")
        self.page.wait_for_function(
            "(f) => eval(f)('bikes').includes('ZOOM IN TO SHOW') && !eval(f)('economy').includes('TO SHOW')", arg=status, timeout=4000
        )
        # Over a city: the other way round. Both stay switched on, and that is what is saved.
        self.page.evaluate("() => { __mlMap.z = 13; (__mlMap.h.moveend || []).forEach((f) => f({})); }")
        self.page.wait_for_function(
            "(f) => eval(f)('economy').includes('ZOOM OUT TO SHOW') && !eval(f)('bikes').includes('TO SHOW')", arg=status, timeout=4000
        )
        saved = json.loads(self.page.evaluate("() => localStorage.getItem('ojos-layers')"))
        self.assertTrue(saved["economy"] and saved["bikes"])
        self.assertNotIn("off", self.page.get_attribute("#wlayers [data-wl='economy']", "class").split())
        self.assertEqual(self.errors, [])

    def test_nothing_on_screen_overlaps_on_phones_tablets_and_computers(self):
        ac = {"ac": [{"hex": "a1b2c3", "flight": "SWA1234 ", "lat": 30.25, "lon": -97.68, "alt_baro": 3000, "gs": 150, "track": 180}]}
        check = """() => {
          const vw = innerWidth, vh = innerHeight, out = [];
          const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '');
          const els = [...document.querySelectorAll('body *')].filter((e) => {
            const cs = getComputedStyle(e), r = e.getBoundingClientRect();
            return cs.position === 'fixed' && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && e.id !== 'stage'
              && r.width > 2 && r.height > 2 && r.width * r.height < 0.8 * vw * vh && r.bottom > 0 && r.top < vh;
          });
          for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i], b = els[j];
            if (a.contains(b) || b.contains(a)) continue;
            const r = a.getBoundingClientRect(), s = b.getBoundingClientRect(),
              w = Math.min(r.right, s.right) - Math.max(r.left, s.left), h = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
            if (w > 3 && h > 3) out.push(name(a) + ' over ' + name(b));
          }
          document.querySelectorAll('button').forEach((e) => {
            const r = e.getBoundingClientRect();
            if (r.width && r.bottom > 0 && r.top < vh && (r.right > vw + 1 || r.left < -1) && getComputedStyle(e).display !== 'none')
              out.push('cut off: ' + (e.textContent || '').trim().slice(0, 20));
          });
          return out;
        }"""
        for w, h in [(375, 667), (390, 844), (820, 1180), (1280, 800)]:
            ctx = self.browser.new_context(viewport={"width": w, "height": h})
            p = ctx.new_page()
            p.route("**/*", self._local_only)
            p.route("**/api.adsb.lol/v2/point/**", lambda r: r.fulfill(body=json.dumps(ac), content_type="application/json", headers={"access-control-allow-origin": "*"}))
            p.add_init_script("localStorage.setItem('ojos-onb', 'true'); window.__ODD_CLASSIC = false;"
                              "localStorage.setItem('ojos-layers', JSON.stringify({air: true, img: true}));")
            p.add_init_script(MAPLIBRE_STANDIN)
            p.goto(self.url)
            p.wait_for_timeout(3000)
            for step in [None, "[data-rw='layers']", "[data-rw='layers']", "[data-rw='events']", "[data-rw='events']",
                         "[data-rw='search']", "[data-rw='search']", "[data-rw='moving']"]:
                if step:
                    p.locator("#rwdash " + step + ", #mvp " + step).first.click()
                    p.wait_for_timeout(500)
                self.assertEqual(p.evaluate(check), [], "%dx%d after %s" % (w, h, step))
            ctx.close()

    def test_events_has_live_news_and_emergency_news_from_around_the_world(self):
        now = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())
        def rss(items):
            return "<rss><channel>" + "".join(
                "<item><title>%s - %s</title><link>https://news.example.org/%d</link><source>%s</source><pubDate>%s</pubDate></item>" % (t, src, i, src, now)
                for i, (t, src) in enumerate(items)
            ) + "</channel></rss>"
        world = rss([("Leaders meet for climate talks in Geneva", "World Wire"), ("Flooding forces thousands to evacuate in Bangladesh", "Asia Desk")])
        gdacs = ('<rss xmlns:gdacs="http://www.gdacs.org" xmlns:georss="http://www.georss.org/georss"><channel><item><title>Green earthquake alert in Chile</title>'
                 '<link>https://www.gdacs.org/report.aspx?eventid=1</link><guid>eq1</guid><gdacs:alertlevel>Green</gdacs:alertlevel>'
                 '<georss:point>-33.4 -70.6</georss:point><pubDate>%s</pubDate></item></channel></rss>' % now)
        for pat, body in (("**/news.google.com/**", world), ("**/www.gdacs.org/xml/rss.xml", gdacs), ("**/api.gdeltproject.org/**", "{}")):
            self.page.route(pat, (lambda b: lambda r: r.fulfill(body=b, content_type="text/xml", headers={"access-control-allow-origin": "*"}))(body))
        self.page.route("**/nominatim.openstreetmap.org/**", lambda r: r.fulfill(body=json.dumps({"address": {"country": "United States", "country_code": "us"}}), content_type="application/json", headers={"access-control-allow-origin": "*"}))
        self.use_dashboard()
        self.page.reload()
        self.page.wait_for_selector("#rwdash .rwdock [data-rw='events']", timeout=8000)
        self.page.click("#rwdash .rwdock [data-rw='events']")
        self.page.wait_for_selector("#feed .evtabs", timeout=5000)
        self.assertEqual(self.page.locator("#feed .evtabs button").all_inner_texts(), ["Events", "Live news", "⚠ Emergency"])
        self.page.click("#feed [data-evt='live']")
        self.page.wait_for_function("() => /climate talks in Geneva/.test(document.getElementById('feed').textContent)", timeout=15000)
        self.assertIn("AROUND THE WORLD", self.page.inner_text("#feed"))
        self.page.click("#feed [data-evt='emg']")
        self.page.wait_for_function(
            "() => /Green earthquake alert in Chile/.test(document.getElementById('feed').textContent)"
            " && /evacuate in Bangladesh/.test(document.getElementById('feed').textContent)",
            timeout=15000,
        )
        feed_text = self.page.inner_text("#feed")
        self.assertIn("DISASTERS WORLDWIDE", feed_text)
        self.assertNotIn("climate talks", feed_text, "only emergencies under Emergency")
        # ◎ shows the disaster on the map; a story opens as an app screen.
        self.assertTrue(self.visible("#feed [data-evm]"))
        self.page.locator("#feed .row.evn [data-evn]").first.click()
        self.page.wait_for_selector("#pgv.on", timeout=5000)
        self.assertEqual(self.errors, [])

    def test_double_tap_a_layer_to_see_only_it_and_again_to_restore(self):
        self.page.wait_for_selector("#wlayers [data-wl='radio']", state="attached", timeout=5000)
        state = "() => JSON.parse(localStorage.getItem('ojos-layers') || '{}')"
        before = self.page.evaluate(state)
        self.assertTrue(before.get("quake"))
        self.assertFalse(before.get("radio"))
        self.page.locator("#wlayers [data-wl='radio']").dispatch_event("click")
        self.page.locator("#wlayers [data-wl='radio']").dispatch_event("click")
        solo = self.page.evaluate(state)
        self.assertTrue(solo["radio"])
        self.assertFalse(solo["quake"])
        self.assertTrue(solo.get("img"), "the base map stays on")
        self.page.wait_for_timeout(500)
        self.page.locator("#wlayers [data-wl='radio']").dispatch_event("click")
        self.page.locator("#wlayers [data-wl='radio']").dispatch_event("click")
        after = self.page.evaluate(state)
        self.assertTrue(after["quake"])
        self.assertFalse(after["radio"])
        self.assertEqual(self.errors, [])

    def test_the_smooth_globe_is_the_only_view_and_satellite_the_only_style(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        # Choices saved before v97 (the 3D globe, a street map style) give way to the Smooth globe and satellite.
        self.page.evaluate(
            "() => { var s = JSON.parse(localStorage.getItem('ojos-set') || '{}'); s.display = 'globe'; s.style = 'street'; localStorage.setItem('ojos-set', JSON.stringify(s)); }"
        )
        self.page.reload()
        self.page.wait_for_function("() => document.body.classList.contains('rw-canvas')", timeout=8000)
        self.assertEqual(json.loads(self.page.evaluate("() => localStorage.getItem('ojos-set')"))["style"], "sat")
        self.page.click("#rwdash .rwdock [data-rw='set']")
        text = self.page.inner_text("#brief")
        for gone in ["DISPLAY", "MAP STYLE", "Command mode", "Flat map"]:
            self.assertNotIn(gone, text)
        self.assertEqual(self.page.locator("[data-br^='dp-'], [data-br^='st-'], [data-br='cmd']").count(), 0)
        self.assertEqual(self.page.locator("#cmdbar, #cmdtk").count(), 0)
        self.assertEqual(self.errors, [])

    def test_phones_with_a_powervr_chip_start_on_the_smooth_globe(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        # Report an Imagination (PowerVR) chip, like a Pixel 10's, with Flat map saved from v81.
        self.page.add_init_script("window.__ODD_GPU = 'PowerVR D-Series DXT-48-1536';")
        self.page.evaluate(
            "() => { var s = JSON.parse(localStorage.getItem('ojos-set') || '{}'); s.display = 'flat'; delete s.displayV; localStorage.setItem('ojos-set', JSON.stringify(s)); }"
        )
        self.page.reload()
        # From space: the app's own globe, drawn without the graphics chip.
        self.page.wait_for_function("() => document.body.classList.contains('rw-canvas')", timeout=8000)
        self.page.wait_for_timeout(1700)
        # Zooming in to a region hands over to the flat map at the same place...
        vp = self.page.viewport_size
        self.page.mouse.move(vp["width"] / 2, vp["height"] / 2)
        for _ in range(6):
            self.page.mouse.wheel(0, -500)
            self.page.wait_for_timeout(60)
        self.page.wait_for_function(
            "() => document.body.classList.contains('rw-globe') && window.__ml && window.__ml.style && window.__ml.style.projection.type === 'mercator'",
            timeout=5000,
        )
        self.page.wait_for_timeout(1700)
        # ...and zooming far back out returns to the round globe.
        self.page.evaluate("() => { __mlMap.z = 2; (__mlMap.h.zoomend || []).forEach((f) => f({})); }")
        self.page.wait_for_function("() => document.body.classList.contains('rw-canvas')", timeout=5000)
        self.assertEqual(self.errors, [])

    def test_see_in_3d_is_offered_without_a_key_and_asks_for_one(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.add_init_script("localStorage.removeItem('ojos-keys');")
        self.page.reload()
        self.open_map()
        self.page.evaluate("() => { __mlMap.z = 13; (__mlMap.h.moveend || []).forEach((f) => f({})); }")
        self.assertTrue(self.visible("#rw3d"), "offered from a city zoom even with no key")
        self.page.evaluate("() => { document.querySelector('#rw3d').click(); }")
        self.page.wait_for_function("() => /key under Settings/.test(document.body.textContent)", timeout=4000)
        self.assertFalse(self.page.evaluate("() => document.body.classList.contains('real')"))

    def test_zoomed_into_a_city_see_in_3d_opens_the_close_up_and_comes_back(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.add_init_script(CESIUM_STANDIN)
        self.page.reload()
        self.open_map()
        self.page.wait_for_timeout(300)
        self.assertFalse(self.visible("#rw3d"), "not offered from space")
        self.page.evaluate("() => { __mlMap.z = 15.5; (__mlMap.h.moveend || []).forEach((f) => f({})); }")
        self.assertTrue(self.visible("#rw3d"))
        maps = self.page.evaluate("() => __ml.maps")
        self.page.click("#rw3d")
        self.page.wait_for_function("() => document.body.classList.contains('real')", timeout=5000)
        self.assertFalse(self.visible("#rw3d"))
        self.assertTrue(self.visible("#rwdash .rwdock"))
        # The close-up's ✕ returns to the map, zoomed in where it was.
        self.page.click("#t4bar [data-t4='x']")
        self.page.wait_for_function(
            "(n) => !document.body.classList.contains('real') && document.body.classList.contains('rw-globe') && __ml.maps > n && __mlMap.z > 14",
            arg=maps,
            timeout=5000,
        )
        self.assertEqual(self.errors, [])

    def test_smooth_globe_draws_country_and_state_names(self):
        def topo(obj, name, x0, y0):
            return {
                "type": "Topology",
                "arcs": [[[x0, y0], [x0 + 30, y0], [x0 + 30, y0 + 20], [x0, y0 + 20], [x0, y0]]],
                "objects": {obj: {"type": "GeometryCollection", "geometries": [
                    {"type": "Polygon", "arcs": [[0]], "properties": {"name": name}}]}},
            }
        for url, body in (
            ("**/world-atlas@2/countries-50m.json", topo("countries", "United States of America", -115, 28)),
            ("**/us-atlas@3/states-10m.json", topo("states", "Texas", -104, 28)),
        ):
            self.page.route(url, (lambda b: lambda r: r.fulfill(body=json.dumps(b), content_type="application/json"))(body))
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.add_init_script("window.__ODD_GPU = 'PowerVR D-Series DXT-48-1536';")
        self.page.add_init_script(
            "window.__texts = new Set(); const ft = CanvasRenderingContext2D.prototype.fillText;"
            " CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { window.__texts.add(String(t)); return ft.apply(this, arguments); };"
        )
        self.page.reload()
        self.page.wait_for_function("() => document.body.classList.contains('rw-canvas')", timeout=8000)
        self.page.wait_for_function("() => window.__texts.has('UNITED STATES')", timeout=8000)
        self.assertEqual(self.errors, [])

    def test_android_phones_start_on_the_smooth_globe(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.add_init_script("window.__ODD_UA = 'Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro XL) Mobile';")
        self.page.reload()
        self.page.wait_for_function("() => document.body.classList.contains('rw-canvas')", timeout=8000)
        self.assertEqual(self.errors, [])

    def test_hide_menus_clears_the_screen_and_one_button_brings_them_back(self):
        self.page.click("#bBare")
        self.assertTrue(
            self.page.evaluate("() => document.body.classList.contains('bare')")
        )
        self.assertFalse(self.visible(".hud"))
        self.assertTrue(self.visible("#bareX"))
        self.page.click("#bareX")
        self.assertFalse(
            self.page.evaluate("() => document.body.classList.contains('bare')")
        )
        self.assertTrue(self.visible(".hud"))

    def test_five_logo_taps_still_open_the_signature_not_the_sky(self):
        self.tap_logo(5)
        self.page.wait_for_timeout(700)
        self.assertTrue(self.visible("#sigfx"))
        # The name, the roles, the promise and where it began.
        card = self.page.inner_text("#sigfx").upper()
        for words in ("MARK JOSEPH", "LEAD ENGINEER", "CODER", "OJOS ABIERTOS. FAMILIA PROTEGIDA.", "FOR MY FAMILY", "AUSTIN, TEXAS", "EST. 2026"):
            self.assertIn(words, card)
        self.assertFalse(self.visible("#sky"))
        self.assertFalse(
            self.page.evaluate("() => document.body.classList.contains('rw')")
        )
        self.assertEqual(self.errors, [])

    def test_holding_the_logo_opens_the_sky(self):
        box = self.page.locator(".brand").bounding_box()
        self.page.mouse.move(box["x"] + 20, box["y"] + 20)
        self.page.mouse.down()
        self.page.wait_for_timeout(900)
        self.page.mouse.up()
        self.page.wait_for_timeout(600)
        self.assertTrue(self.visible("#sky"))
        self.assertFalse(
            self.page.evaluate("() => document.body.classList.contains('rw')")
        )
        self.page.click("[data-sky='sky']")
        self.page.click("[data-sky='x']")
        self.assertFalse(self.visible("#sky"))
        self.assertEqual(self.errors, [])

    def test_the_logo_opens_3d_space_with_planets_spacecraft_and_rovers(self):
        self.page.add_init_script(THREE_STANDIN)
        self.use_dashboard()
        self.page.reload()
        self.page.wait_for_selector("#rwdash .rwbrand", state="visible", timeout=8000)
        self.page.click(".rwbrand")
        self.page.wait_for_selector("#spx", state="visible", timeout=4000)
        self.page.wait_for_function("() => window.__three.renders > 5", timeout=5000)
        self.assertIn("on", self.page.get_attribute("[data-sky='space']", "class"))
        self.assertFalse(self.visible("#skycv"))
        # Fly to Mars: its card has the real numbers.
        self.page.click("#spx [data-spx='go-mars']")
        self.page.wait_for_selector("#spxcard", state="visible", timeout=3000)
        card = self.page.inner_text("#spxcard")
        self.assertIn("Mars", card)
        self.assertIn("2 moons", card)
        self.assertRegex(card, r"FROM EARTH NOW\s*[\d,]+ million km")
        # Deep space shows the probes leaving the solar system.
        self.page.click("#spx [data-spx='go-far']")
        self.page.wait_for_function("() => [...document.querySelectorAll('#spx .spxl.probe')].some((e) => e.style.display === 'block' && /Voyager 1/.test(e.textContent))", timeout=3000)
        self.page.locator("#spx .spxl.probe", has_text="Voyager 1").dispatch_event("click")
        self.assertIn("estimated from its course", self.page.inner_text("#spxcard"))
        # Time can run fast, and LIVE comes back to now.
        self.page.click("#spx [data-spx='r-2']")
        self.assertIn("on", self.page.get_attribute("#spx [data-spx='r-2']", "class"))
        self.page.click("#spx [data-spx='r-0']")
        # The night sky is one tab away.
        self.page.click("[data-sky='sky']")
        self.assertFalse(self.visible("#spx"))
        self.assertTrue(self.visible("#skycv"))
        self.page.click("[data-sky='x']")
        self.assertFalse(self.visible("#sky"))
        self.assertEqual(self.errors, [])

    def test_without_the_3d_engine_space_falls_back_to_the_flat_solar_system(self):
        self.use_dashboard()
        self.page.reload()
        self.page.wait_for_selector("#rwdash .rwbrand", state="visible", timeout=8000)
        self.page.click(".rwbrand")
        self.page.wait_for_function("() => [...document.querySelectorAll('.toast')].some((t) => /flat solar system/.test(t.textContent))", timeout=8000)
        self.assertTrue(self.visible("#skycv"))
        self.assertFalse(self.visible("#spx"))
        self.assertEqual(self.errors, [])

    def test_crime_groups_and_leaders_layers(self):
        def b(**kv):
            return {k: {"value": v} for k, v in kv.items()}
        world = {"results": {"bindings": [
            b(iso="FR", cLabel="France", coord="Point(2.35 48.86)", hsLabel="Emmanuel Macron", hgLabel="A Prime Minister", hsoLabel="President of France", hgoLabel="Prime Minister of France"),
        ]}}
        dem, rep = "http://www.wikidata.org/entity/Q29552", "http://www.wikidata.org/entity/Q29468"
        us = {"results": {"bindings": [
            b(s="http://www.wikidata.org/entity/Q1439", sLabel="Texas", coord="Point(-97.74 30.27)", govLabel="Greg Abbott", gp=rep, gpLabel="Republican Party", senLabel="Ted Cruz", sp=rep, spLabel="Republican Party"),
            b(s="http://www.wikidata.org/entity/Q1439", sLabel="Texas", coord="Point(-97.74 30.27)", govLabel="Greg Abbott", gp=rep, gpLabel="Republican Party", senLabel="John Cornyn", sp=rep, spLabel="Republican Party"),
            b(s="http://www.wikidata.org/entity/Q99", sLabel="California", coord="Point(-121.49 38.58)", govLabel="Gavin Newsom", gp=dem, gpLabel="Democratic Party"),
        ]}}
        self.page.route(
            "**/query.wikidata.org/sparql*",
            lambda r: r.fulfill(body=json.dumps(us if "Q35657" in r.request.url else world), content_type="application/sparql-results+json"),
        )
        self.page.add_init_script("localStorage.setItem('ojos-layers', JSON.stringify({crime: true, leaders: true}))")
        self.page.reload()
        self.page.wait_for_function(
            "() => /US GOVERNORS 1 D · 1 R/.test((document.getElementById('wlayers') || {}).textContent || '')", timeout=15000
        )
        txt = self.page.inner_text("#wlayers")
        self.assertIn("Organized crime groups", txt)
        self.assertIn("Politics", txt)
        self.assertEqual(self.errors, [])

    def test_focus_mode_adds_and_clears_a_state(self):
        self.page.click("#bFocus")
        self.page.fill("#focQ", "TX")
        self.page.press("#focQ", "Enter")
        self.page.wait_for_function(
            "() => document.getElementById('focus').textContent.includes('Texas')",
            timeout=10000,
        )
        self.assertIn("1 area", self.page.inner_text("#focus"))
        self.page.click("[data-fo=clear]")
        self.assertIn("Whole world", self.page.inner_text("#focus"))
        self.assertEqual(self.errors, [])

    def test_survives_with_every_public_source_offline(self):
        self.page.wait_for_timeout(SETTLE_MS)
        self.assertEqual(self.errors, [])
        self.assertTrue(self.visible("#bFind"))


if __name__ == "__main__":
    unittest.main()
