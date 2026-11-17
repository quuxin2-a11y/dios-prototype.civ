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
    getBounds() { return { getWest: () => this.c.lng - 1, getEast: () => this.c.lng + 1, getSouth: () => this.c.lat - 1, getNorth: () => this.c.lat + 1 }; }
  }
  window.maplibregl = { Map, NavigationControl: function () {}, AttributionControl: function () {} };
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
                "() => document.body.classList.contains('rw-globe')", timeout=8000
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

    def test_starts_on_the_dark_globe_and_the_logo_opens_the_sky(self):
        self.use_dashboard()
        self.page.add_init_script(MAPLIBRE_STANDIN)
        self.page.reload()
        self.page.wait_for_function(
            "() => document.body.classList.contains('rw-globe') && window.__ml.layers.includes('cams')",
            timeout=15000,
        )
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
        self.assertEqual(style["projection"], {"type": "globe"})
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
        self.page.wait_for_function("() => document.body.classList.contains('rw-globe')", timeout=8000)
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
        self.page.click("#cfp .cfrow >> nth=0")
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
        self.page.click("[data-sky='sys']")
        self.page.click("[data-sky='x']")
        self.assertFalse(self.visible("#sky"))
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
