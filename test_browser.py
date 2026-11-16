"""Browser tests: load the built app in headless Chromium and use its main screens.

Every request outside the local test server is blocked, so the results do not depend on
public sources being up, and the tests also check that the app copes when they are down.

Run:
    python3 -m pip install playwright && python3 -m playwright install chromium
    python3 -m unittest -v test_browser
"""

import functools
import http.server
import json
import threading
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
        elif url.startswith("https://api-v3.mbta.com/vehicles"):
            route.fulfill(
                body=json.dumps(MBTA_SAMPLE),
                content_type="application/json",
                headers={"access-control-allow-origin": "*"},
            )
        else:
            route.abort()

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
