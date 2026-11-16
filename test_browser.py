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
