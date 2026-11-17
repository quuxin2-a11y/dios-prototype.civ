#!/usr/bin/env python3
"""Install the native Android sources kept in this repository into a generated Capacitor project.

The Android project is generated in CI by ``npx cap add android``. This script layers our own code on top:

* ``*.java`` files whose package is ``com.ojosdedios.app`` go to ``app/src/main/java/com/ojosdedios/app/``;
  files ending in ``Test.java`` go to the JVM unit-test source set, ``app/src/test/java/com/ojosdedios/app/``.
* Resource files named ``res-<type>--<name>.xml`` go to ``app/src/main/res/<type>/<name>.xml``.
* ``AndroidManifest.xml`` gets the permissions below, the Emergency widget receiver and the background alert
  check (``AlertChecker``).

Every file it replaces is backed up first, so ``--undo`` restores the generated project exactly.

Usage::

    python3 install_native.py <android-project-dir>          # install
    python3 install_native.py <android-project-dir> --undo   # roll back
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

PACKAGE = "com.ojosdedios.app"
SOURCE_DIR = Path(__file__).resolve().parent
LEDGER = ".native-install.json"
BACKUP_SUFFIX = ".orig-native"
RESOURCE_NAME = re.compile(r"^res-(?P<type>[a-z][a-z0-9_-]*)--(?P<name>[a-z0-9_]+\.xml)$")

# Vibration for SOS; notifications and restart for the background alert check (AlertChecker).
MANIFEST_PERMISSIONS = (
    "android.permission.VIBRATE",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.RECEIVE_BOOT_COMPLETED",
)
MANIFEST_RECEIVER = """
        <receiver
            android:name=".EmergencyWidget"
            android:exported="false"
            android:label="Ojos de Dios: Emergency">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/widget_emergency_info" />
        </receiver>
        <receiver
            android:name=".AlertChecker"
            android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
"""


class InstallError(RuntimeError):
    """Raised when the target does not look like a Capacitor Android project."""


def java_sources(source_dir: Path = SOURCE_DIR) -> list[Path]:
    """Java files that belong to the app package, sorted for a stable install order."""
    found = []
    for path in sorted(source_dir.glob("*.java")):
        if re.search(r"^\s*package\s+" + re.escape(PACKAGE) + r"\s*;", path.read_text(encoding="utf-8"), re.M):
            found.append(path)
    return found


def resource_sources(source_dir: Path = SOURCE_DIR) -> list[tuple[Path, str, str]]:
    """(file, resource type, resource file name) for every ``res-<type>--<name>.xml`` file."""
    found = []
    for path in sorted(source_dir.glob("res-*.xml")):
        match = RESOURCE_NAME.match(path.name)
        if not match:
            raise InstallError(f"resource file name not understood: {path.name}")
        found.append((path, match["type"], match["name"]))
    return found


def patch_manifest(text: str) -> str:
    """Adds the permissions and the two receivers. Running it twice changes nothing."""
    if "</application>" not in text or "</manifest>" not in text:
        raise InstallError("AndroidManifest.xml has no <application> or <manifest> end tag")
    for name in MANIFEST_PERMISSIONS:
        if f'"{name}"' not in text:
            text = text.replace("</manifest>", f'    <uses-permission android:name="{name}" />\n</manifest>', 1)
    if ".EmergencyWidget" not in text:
        text = text.replace("</application>", MANIFEST_RECEIVER + "    </application>", 1)
    return text


def _place(src: Path, dest: Path, ledger: dict) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        backup = dest.with_name(dest.name + BACKUP_SUFFIX)
        shutil.copy2(dest, backup)
        ledger["replaced"].append(str(dest))
    else:
        ledger["added"].append(str(dest))
    shutil.copy2(src, dest)


def install(project: Path, source_dir: Path = SOURCE_DIR) -> dict:
    main = project / "app" / "src" / "main"
    manifest = main / "AndroidManifest.xml"
    if not manifest.is_file():
        raise InstallError(f"not a Capacitor Android project: {manifest} is missing")
    if (project / LEDGER).exists():
        raise InstallError("native sources are already installed; run with --undo first")

    ledger: dict = {"added": [], "replaced": []}
    package_path = Path(*PACKAGE.split("."))
    for src in java_sources(source_dir):
        source_set = "test" if src.name.endswith("Test.java") else "main"
        _place(src, project / "app" / "src" / source_set / "java" / package_path / src.name, ledger)
    for src, res_type, name in resource_sources(source_dir):
        _place(src, main / "res" / res_type / name, ledger)

    shutil.copy2(manifest, manifest.with_name(manifest.name + BACKUP_SUFFIX))
    ledger["replaced"].append(str(manifest))
    manifest.write_text(patch_manifest(manifest.read_text(encoding="utf-8")), encoding="utf-8")

    (project / LEDGER).write_text(json.dumps(ledger, indent=2), encoding="utf-8")
    return ledger


def undo(project: Path) -> dict:
    ledger_path = project / LEDGER
    if not ledger_path.exists():
        return {"added": [], "replaced": []}
    ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    for name in ledger["added"]:
        Path(name).unlink(missing_ok=True)
    for name in ledger["replaced"]:
        path = Path(name)
        backup = path.with_name(path.name + BACKUP_SUFFIX)
        if backup.exists():
            shutil.move(str(backup), str(path))
    ledger_path.unlink()
    return ledger


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("project", type=Path, help="the Android project directory (contains app/)")
    parser.add_argument("--undo", action="store_true", help="restore the generated project")
    args = parser.parse_args(argv)
    try:
        result = undo(args.project) if args.undo else install(args.project)
    except InstallError as error:
        print(f"install_native: {error}", file=sys.stderr)
        return 1
    verb = "removed" if args.undo else "installed"
    print(f"install_native: {verb} {len(result['added'])} new and {len(result['replaced'])} replaced files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
