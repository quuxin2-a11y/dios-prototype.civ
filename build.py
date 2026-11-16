#!/usr/bin/env python3
"""Build index.html, the single page the app ships as.

Inputs
  src-template.html  page markup, with /*@include NAME*/ markers
  src-styles.css     styles
  src-NN-*.js        application modules, concatenated in order inside one closure
  src-data-*.json    bundled data, embedded as compact JSON

Usage
  python3 build.py           rebuild index.html
  python3 build.py --check   exit 1 if index.html is out of date (used by CI)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "index.html"
INCLUDE = re.compile(r"/\*@include ([\w.-]+)\*/")


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


def modules():
    names = sorted(p.name for p in ROOT.glob("src-[0-9][0-9]-*.js"))
    if not names:
        raise SystemExit("build: no src-NN-*.js modules found")
    return names


def app_bundle():
    # Modules share one scope, so they are joined in order and wrapped in a single closure.
    return "(function () {\n" + "".join(read(name) for name in modules()) + "})();\n"


def json_block(name):
    data = json.loads(read(name))
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return text.replace("<", "\\u003c")  # keeps "</script>" out of the page


def expand(match):
    name = match.group(1)
    if name == "app":
        return app_bundle()
    if name.endswith(".json"):
        return json_block(name)
    return read(name)


def render():
    page = INCLUDE.sub(expand, read("src-template.html"))
    leftover = INCLUDE.search(page)
    if leftover:
        raise SystemExit("build: unresolved include " + leftover.group(0))
    return page


def main():
    page = render()
    if "--check" in sys.argv:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current != page:
            print("index.html is out of date: run python3 build.py")
            return 1
        print("index.html matches the sources (%d modules)" % len(modules()))
        return 0
    OUTPUT.write_text(page, encoding="utf-8")
    print("built index.html (%d bytes) from %d modules" % (len(page), len(modules())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
