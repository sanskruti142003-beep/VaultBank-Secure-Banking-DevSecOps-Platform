#!/usr/bin/env python3
"""Validate that security exceptions are explicit and unexpired."""

from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / "config" / "pipeline-policy.yml"
TRIVYIGNORE = ROOT / ".trivyignore.yaml"
SUPPRESSION = ROOT / "config" / "security" / "dependency-check-suppression.xml"

REQUIRED_FIELDS = {
    "finding_id",
    "tool",
    "affected_component",
    "business_justification",
    "compensating_control",
    "owner",
    "approved_by",
    "creation_date",
    "expiry_date",
    "tracking_issue",
}


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def parse_date(value: str, source: Path) -> dt.date:
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{source}: invalid expiry_date {value!r}; use YYYY-MM-DD") from exc


def validate_json_exceptions(path: Path) -> None:
    if not path.exists():
        return
    if path.suffix != ".json":
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    exceptions = data.get("exceptions", [])
    today = dt.datetime.now(dt.timezone.utc).date()
    for item in exceptions:
        missing = REQUIRED_FIELDS - set(item)
        if missing:
            fail(f"{path}: exception is missing fields: {', '.join(sorted(missing))}")
        expiry = parse_date(str(item["expiry_date"]), path)
        if expiry < today:
            fail(f"{path}: exception {item['finding_id']} expired on {expiry}")


def validate_text_dates(path: Path) -> None:
    if not path.exists():
        fail(f"required exception policy file missing: {path.relative_to(ROOT)}")
    text = path.read_text(encoding="utf-8")
    today = dt.datetime.now(dt.timezone.utc).date()
    for match in re.finditer(r"expiry_date:\s*['\"]?(\d{4}-\d{2}-\d{2})", text):
        expiry = parse_date(match.group(1), path)
        if expiry < today:
            fail(f"{path.relative_to(ROOT)} has an expired exception date: {expiry}")
    for match in re.finditer(r'until="(\d{4}-\d{2}-\d{2})"', text):
        expiry = parse_date(match.group(1), path)
        if expiry < today:
            fail(f"{path.relative_to(ROOT)} has an expired suppression date: {expiry}")


def main() -> int:
    for path in (POLICY, TRIVYIGNORE, SUPPRESSION):
        validate_text_dates(path)
    validate_json_exceptions(ROOT / "config" / "security" / "exceptions.json")
    print("PASS: security exception policies are present and unexpired")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
