#!/usr/bin/env python3
"""Install the native Android sources kept in this repository into a generated Capacitor project.

The Android project is generated in CI by ``npx cap add android``. This script layers our own code on top:

* ``*.java`` files whose package is ``com.ojosdedios.app`` go to ``app/src/main/java/com/ojosdedios/app/``;
  files ending in ``Test.java`` go to the JVM unit-test source set, ``app/src/test/java/com/ojosdedios/app/``.
* Resource files named ``res-<type>--<name>.xml`` go to ``app/src/main/res/<type>/<name>.xml``.
* ``AndroidManifest.xml`` gets the permissions below, the Emergency widget receiver, the background alert
  check (``AlertChecker``) and the visual positioning screen (``VpsActivity``, ARCore "AR optional").
* ``app/build.gradle`` gets the libraries that screen needs (``GRADLE_DEPENDENCIES``).

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
    "android.permission.CAMERA",
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
# Visual positioning (ARCore Geospatial API). "AR optional": the app installs and runs on phones without ARCore;
# only that screen needs it. Authorised without a key: Google Cloud recognises the app by its signing certificate.
MANIFEST_VPS = """
        <activity
            android:name=".VpsActivity"
            android:exported="false"
            android:screenOrientation="portrait"
            android:theme="@style/AppTheme.NoActionBar"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|uiMode" />
        <meta-data android:name="com.google.ar.core" android:value="optional" />
"""
MANIFEST_FEATURES = """    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.ar" android:required="false" />
"""
# Versions chosen to build with Capacitor 6's compileSdk 34.
GRADLE_DEPENDENCIES = (
    "implementation 'com.google.ar:core:1.44.0'",
    "implementation 'com.google.android.gms:play-services-location:21.0.1'",
    "implementation 'com.google.android.gms:play-services-auth:20.7.0'",
)


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


def _insert(text: str, anchor: str, block: str, made: list | None) -> str:
    """Puts ``block`` just before the first ``anchor`` and records it so --undo can take out exactly that."""
    if anchor not in text:
        anchor = anchor.strip()
    if made is not None:
        made.append(block)
    return text.replace(anchor, block + anchor, 1)


def patch_manifest(text: str, made: list | None = None) -> str:
    """Adds the permissions, the two receivers and the positioning screen. Running it twice changes nothing."""
    if "</application>" not in text or "</manifest>" not in text or "<application" not in text:
        raise InstallError("AndroidManifest.xml has no <application> or <manifest> end tag")
    for name in MANIFEST_PERMISSIONS:
        if f'"{name}"' not in text:
            text = _insert(text, "</manifest>", f'    <uses-permission android:name="{name}" />\n', made)
    if ".EmergencyWidget" not in text:
        text = _insert(text, "    </application>", MANIFEST_RECEIVER, made)
    if ".VpsActivity" not in text:
        text = _insert(text, "    </application>", MANIFEST_VPS, made)
    if "android.hardware.camera.ar" not in text:
        text = _insert(text, "    <application", MANIFEST_FEATURES, made)
    return text


def patch_gradle(text: str, made: list | None = None) -> str:
    """Adds the visual positioning libraries to the app's dependencies. Running it twice changes nothing."""
    match = re.search(r"^dependencies\s*\{[ \t]*\n", text, re.M)
    if not match:
        raise InstallError("app/build.gradle has no dependencies block")
    missing = [d for d in GRADLE_DEPENDENCIES if d.split("'")[1].rsplit(":", 1)[0] not in text]
    if not missing:
        return text
    block = "".join(f"    {d}\n" for d in missing)
    if made is not None:
        made.append(block)
    return text[: match.end()] + block + text[match.end() :]


def unpatch(text: str, made: list) -> str:
    """Takes out exactly what a patch put in, leaving any later changes by the build (version, signing) alone."""
    for block in reversed(made):
        text = text.replace(block, "", 1)
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

    # The manifest and build.gradle are edited in place, not replaced: the build changes them again afterwards
    # (location permissions, version number, signing), and --undo must keep those changes.
    ledger["edits"] = {}
    made: list = []
    manifest.write_text(patch_manifest(manifest.read_text(encoding="utf-8"), made), encoding="utf-8")
    ledger["edits"][str(manifest)] = made
    gradle = project / "app" / "build.gradle"
    if gradle.is_file():
        made = []
        gradle.write_text(patch_gradle(gradle.read_text(encoding="utf-8"), made), encoding="utf-8")
        ledger["edits"][str(gradle)] = made

    (project / LEDGER).write_text(json.dumps(ledger, indent=2), encoding="utf-8")
    return ledger


def undo(project: Path) -> dict:
    ledger_path = project / LEDGER
    if not ledger_path.exists():
        return {"added": [], "replaced": []}
    ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    for name in ledger["added"]:
        Path(name).unlink(missing_ok=True)
    for name, made in ledger.get("edits", {}).items():
        path = Path(name)
        if path.exists():
            path.write_text(unpatch(path.read_text(encoding="utf-8"), made), encoding="utf-8")
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
