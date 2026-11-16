"""Browser tests: load the built app in headless Chromium and use its main screens.

Every request outside the local test server is blocked, so the results do not depend on
public sources being up, and the tests also check that the app copes when they are down.

Run:
    python3 -m pip install playwright && python3 -m playwright install chromium
    python3 -m unittest -v test_browser
"""
import functools
import http.server
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
        if route.request.url.startswith("http://127.0.0.1"):
            route.continue_()
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
            """() => ['gaz', 'cam-data', 'models', 'land-dots'].map(
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

    def test_survives_with_every_public_source_offline(self):
        self.page.wait_for_timeout(SETTLE_MS)
        self.assertEqual(self.errors, [])
        self.assertTrue(self.visible("#bFind"))


if __name__ == "__main__":
    unittest.main()
