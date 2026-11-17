"""Unit tests for the Python build tools. Run with: python3 -m unittest -v test_tools"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import check_secrets
import conflict
import rovers
import install_native

GENERATED_MANIFEST = """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="Ojos de Dios">
        <activity android:name=".MainActivity" />
    </application>
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
"""


class CheckSecretsTest(unittest.TestCase):
    def scan(self, files: dict[str, str]) -> list[check_secrets.Finding]:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name, text in files.items():
                (root / name).write_text(text, encoding="utf-8")
            return check_secrets.scan(root)

    def test_finds_a_whole_google_key(self) -> None:
        key = "AIza" + "S" * 35
        findings = self.scan({"app.js": f'var k="{key}";'})
        self.assertEqual([(str(f.path), f.line, f.kind) for f in findings], [("app.js", 1, "Google API key")])

    def test_split_shared_key_is_not_reported(self) -> None:
        self.assertEqual(self.scan({"app.js": 'var k=["AIzaSyAAAAAAAAAAAAAAA","BBBBBBBBBBBBBBBBBBBB"].join("");'}), [])

    def test_private_key_block_and_keystore_file(self) -> None:
        findings = self.scan({"notes.md": "-----BEGIN EC " + "PRIVATE KEY-----\nabc", "release.keystore": "x"})
        self.assertEqual(sorted(f.kind for f in findings), ["key or certificate file", "private key"])

    def test_github_token(self) -> None:
        self.assertEqual(len(self.scan({"ci.yml": "token: ghp_" + "a1" * 18})), 1)

    def test_clean_repository(self) -> None:
        self.assertEqual(self.scan({"README.md": "# Hello", "build.py": "print('ok')"}), [])


class InstallNativeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.src = base / "repo"
        self.project = base / "android"
        self.src.mkdir()
        (self.src / "MainActivity.java").write_text("package com.ojosdedios.app;\npublic class MainActivity {}\n")
        (self.src / "Other.java").write_text("package somewhere.else;\nclass Other {}\n")
        (self.src / "MainActivityTest.java").write_text("package com.ojosdedios.app;\npublic class MainActivityTest {}\n")
        (self.src / "res-layout--widget_emergency.xml").write_text("<LinearLayout/>")
        (self.src / "res-drawable--widget_bg.xml").write_text("<shape/>")
        main = self.project / "app" / "src" / "main"
        (main / "java" / "com" / "ojosdedios" / "app").mkdir(parents=True)
        (main / "java" / "com" / "ojosdedios" / "app" / "MainActivity.java").write_text("generated")
        (main / "AndroidManifest.xml").write_text(GENERATED_MANIFEST)
        self.main = main

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_only_app_package_java_is_selected(self) -> None:
        self.assertEqual([p.name for p in install_native.java_sources(self.src)], ["MainActivity.java", "MainActivityTest.java"])

    def test_resource_names_map_to_folders(self) -> None:
        mapped = [(t, n) for _, t, n in install_native.resource_sources(self.src)]
        self.assertEqual(mapped, [("drawable", "widget_bg.xml"), ("layout", "widget_emergency.xml")])

    def test_bad_resource_name_is_rejected(self) -> None:
        (self.src / "res-Layout--Bad Name.xml").write_text("x")
        with self.assertRaises(install_native.InstallError):
            install_native.resource_sources(self.src)

    def test_manifest_patch_is_idempotent(self) -> None:
        once = install_native.patch_manifest(GENERATED_MANIFEST)
        self.assertIn("android.permission.VIBRATE", once)
        self.assertIn(".EmergencyWidget", once)
        self.assertIn(".AlertChecker", once)
        self.assertIn("android.permission.POST_NOTIFICATIONS", once)
        self.assertIn("android.permission.RECEIVE_BOOT_COMPLETED", once)
        self.assertEqual(once.count("android.permission.VIBRATE"), 1)
        self.assertEqual(install_native.patch_manifest(once), once)
        self.assertLess(once.index(".EmergencyWidget"), once.index("</application>"))

    def test_install_then_undo_restores_the_generated_project(self) -> None:
        java = self.main / "java" / "com" / "ojosdedios" / "app" / "MainActivity.java"
        manifest = self.main / "AndroidManifest.xml"
        install_native.install(self.project, self.src)
        self.assertIn("package com.ojosdedios.app", java.read_text())
        test = self.project / "app" / "src" / "test" / "java" / "com" / "ojosdedios" / "app" / "MainActivityTest.java"
        self.assertTrue(test.exists(), "unit tests belong in the test source set")
        self.assertTrue((self.main / "res" / "layout" / "widget_emergency.xml").exists())
        self.assertIn(".EmergencyWidget", manifest.read_text())
        with self.assertRaises(install_native.InstallError):
            install_native.install(self.project, self.src)

        install_native.undo(self.project)
        self.assertEqual(java.read_text(), "generated")
        self.assertEqual(manifest.read_text(), GENERATED_MANIFEST)
        self.assertFalse((self.main / "res" / "layout" / "widget_emergency.xml").exists())
        self.assertFalse(test.exists())
        self.assertFalse((self.project / install_native.LEDGER).exists())

    def test_refuses_a_folder_that_is_not_an_android_project(self) -> None:
        with self.assertRaises(install_native.InstallError):
            install_native.install(Path(self.tmp.name) / "nothing", self.src)


if __name__ == "__main__":
    unittest.main()


def gdelt_row(**over) -> list[str]:
    r = [""] * 61
    r[0], r[6], r[16] = "1001", "RUSSIA", "UKRAINE"
    r[26], r[32], r[33] = "1952", "3", "5"
    r[51], r[52], r[53] = "4", "Kharkiv, Kharkivs'ka Oblast', Ukraine", "UP"
    r[56], r[57], r[59], r[60] = "49.9935", "36.2304", "20261116221500", "https://news.example.org/a"
    for k, v in over.items():
        r[conflict.COL[k]] = v
    return r


class ConflictTest(unittest.TestCase):
    def test_drone_strike_becomes_a_map_item(self) -> None:
        items = conflict.parse_rows([gdelt_row()], 0)
        self.assertEqual(len(items), 1)
        it = items[0]
        self.assertEqual((it["lat"], it["lon"], it["n"]), (49.9935, 36.2304, "Drone strike · Kharkiv"))
        self.assertIn("UNVERIFIED", it["tag"])
        self.assertEqual(it["links"][0][1], "https://news.example.org/a")
        self.assertEqual(dict(it["rows"])["COVERAGE"], "5 articles from 3 sources")

    def test_kinds_and_filters(self) -> None:
        self.assertEqual(conflict.kind_of("1951")[0], "Air strike")
        self.assertEqual(conflict.kind_of("194")[0], "Artillery / shelling")
        self.assertIsNone(conflict.kind_of("042"))
        rows = [
            gdelt_row(code="042"),  # a meeting, not violence
            gdelt_row(geo_type="1"),  # only a country centre
            gdelt_row(articles="1"),  # a single article
            gdelt_row(lat="x"),
            gdelt_row(url="not a link"),
            ["short", "row"],
        ]
        self.assertEqual(conflict.parse_rows(rows, 0), [])

    def test_same_event_type_and_place_is_merged(self) -> None:
        items = conflict.parse_rows([gdelt_row(id="1", articles="3"), gdelt_row(id="2", articles="9")], 0)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], "conflict:2")
        self.assertEqual(dict(items[0]["rows"])["EVENTS HERE"], "2 reports in 24 h")

    def test_file_names_cover_a_day_in_15_minute_steps(self) -> None:
        from datetime import datetime, timezone

        s = conflict.stamps(datetime(2026, 11, 17, 3, 22, tzinfo=timezone.utc), 24)
        self.assertEqual((len(s), s[0], s[-1]), (96, "20261117030000", "20261116031500"))


class RoversTest(unittest.TestCase):
    def test_latest_waypoint_is_the_highest_sol(self) -> None:
        g = {"features": [
            {"geometry": {"type": "Point", "coordinates": [77.45, 18.44]}, "properties": {"sol": 10}},
            {"geometry": {"type": "Point", "coordinates": [77.31, 18.49]}, "properties": {"sol": 1600}},
            {"geometry": {"type": "Point", "coordinates": [77.4, 18.4]}, "properties": {"sol": 900}},
        ]}
        self.assertEqual(rovers.latest(g), {"lat": 18.49, "lon": 77.31, "sol": 1600})

    def test_bad_points_are_skipped_and_east_longitudes_wrap(self) -> None:
        g = {"features": [
            {"geometry": {"type": "Point", "coordinates": ["x", 1]}, "properties": {"sol": 5}},
            {"geometry": {"type": "LineString", "coordinates": [[1, 1], [2, 2]]}},
            {"geometry": {"type": "Point", "coordinates": [354.47, -1.95]}, "properties": {"sol": 2}},
        ]}
        self.assertEqual(rovers.latest(g), {"lat": -1.95, "lon": -5.53, "sol": 2})
        self.assertIsNone(rovers.latest({}))
