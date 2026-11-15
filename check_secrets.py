#!/usr/bin/env python3
"""Fail the build if a credential or signing key has been committed.

Scans every text file in the repository for well-known secret formats, and rejects keystore and
private-key files outright. The shared, provider-restricted keys documented in SECURITY.md are stored
in two parts on purpose and are not matched.

Usage::

    python3 check_secrets.py [directory]   # exit code 1 if anything is found
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Iterator, NamedTuple

PATTERNS: dict[str, re.Pattern[str]] = {
    "Google API key": re.compile(r"AIza[0-9A-Za-z_\-]{35}"),
    "GitHub token": re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36}\b|\bgithub_pat_[0-9A-Za-z_]{60,}\b"),
    "AWS access key": re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    "Slack token": re.compile(r"\bxox[abprs]-[0-9A-Za-z-]{10,}\b"),
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----"),
}
FORBIDDEN_SUFFIXES = {".keystore", ".jks", ".p12", ".pfx", ".pem", ".key"}
SKIP_DIRS = {".git", "node_modules", "__pycache__"}
TEXT_SUFFIXES = {".js", ".py", ".java", ".html", ".css", ".json", ".md", ".xml", ".yml", ".yaml", ".txt", ".webmanifest", ""}
MAX_BYTES = 8_000_000


class Finding(NamedTuple):
    path: Path
    line: int
    kind: str

    def __str__(self) -> str:
        where = f"{self.path}:{self.line}" if self.line else str(self.path)
        return f"{where}: {self.kind}"


def files(root: Path) -> Iterator[Path]:
    for path in sorted(root.rglob("*")):
        if path.is_file() and not SKIP_DIRS.intersection(path.relative_to(root).parts):
            yield path


def scan_text(text: str) -> Iterator[tuple[int, str]]:
    for number, line in enumerate(text.splitlines(), start=1):
        for kind, pattern in PATTERNS.items():
            if pattern.search(line):
                yield number, kind


def scan(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for path in files(root):
        rel = path.relative_to(root)
        if path.suffix.lower() in FORBIDDEN_SUFFIXES:
            findings.append(Finding(rel, 0, "key or certificate file"))
            continue
        if path.suffix.lower() not in TEXT_SUFFIXES or path.stat().st_size > MAX_BYTES:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        findings.extend(Finding(rel, line, kind) for line, kind in scan_text(text))
    return findings


def main(argv: list[str]) -> int:
    root = Path(argv[1] if len(argv) > 1 else ".").resolve()
    findings = scan(root)
    for finding in findings:
        print(f"check_secrets: {finding}", file=sys.stderr)
    if findings:
        print(f"check_secrets: {len(findings)} problem(s). Remove them and rotate any exposed credential.", file=sys.stderr)
        return 1
    print("check_secrets: no credentials found")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
