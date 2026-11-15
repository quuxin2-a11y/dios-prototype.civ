"""Unit tests for the Python build tools. Run with: python3 -m unittest -v test_tools"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import check_secrets
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
