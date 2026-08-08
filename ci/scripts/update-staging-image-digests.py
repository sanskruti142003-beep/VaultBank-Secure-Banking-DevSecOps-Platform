#!/usr/bin/env python3
"""Promote validated Harbor image digests into the staging Kustomization."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


EXPECTED_SERVICES = (
    "auth-service",
    "account-service",
    "transaction-service",
    "payment-service",
    "notification-service",
    "frontend",
)

REGISTRY_PROJECT = "harbor.vaultbank.internal:9443/vault-bank"
DIGEST_RE = re.compile(r"sha256:[0-9a-f]{64}")
IMAGE_NAME_RE = re.compile(r"^  - name: ([a-z0-9._-]+)\s*$")
NEW_NAME_RE = re.compile(r"^    newName:\s*(\S+)\s*$")
DIGEST_LINE_RE = re.compile(r"^    digest:\s*(sha256:[0-9a-f]{64})\s*$")


def die(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def read_json_or_jsonl(path: Path) -> tuple[list[dict[str, object]], str]:
    if not path.is_file():
        die(f"source manifest is missing: {path}")

    if path.suffix == ".jsonl":
        rows = [
            json.loads(line)
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        return rows, ""

    document = json.loads(path.read_text(encoding="utf-8"))
    rows = document.get("images")
    if not isinstance(rows, list):
        die("source manifest does not contain an images array")

    source_commit = ""
    source = document.get("source")
    if isinstance(source, dict):
        source_commit = str(source.get("commit") or "")
    if not source_commit:
        source_commit = str(document.get("source_commit") or "")

    return rows, source_commit


def extract_digest(value: object, service: str) -> str:
    match = DIGEST_RE.search(str(value or ""))
    if not match:
        die(f"missing sha256 digest for {service}")
    return match.group(0)


def load_digests(source: Path, current_commit: str) -> dict[str, str]:
    rows, manifest_commit = read_json_or_jsonl(source)

    if current_commit and manifest_commit and manifest_commit != current_commit:
        die(
            "source manifest commit does not match current checkout: "
            f"{manifest_commit} != {current_commit}"
        )

    digests: dict[str, str] = {}
    commits: dict[str, str] = {}

    for row in rows:
        service = str(row.get("service") or "")
        if service not in EXPECTED_SERVICES:
            die(f"unexpected service in source manifest: {service or 'empty'}")
        if service in digests:
            die(f"duplicate service in source manifest: {service}")

        row_commit = str(row.get("source_commit") or "")
        if current_commit and row_commit and row_commit != current_commit:
            die(
                f"{service} source commit does not match current checkout: "
                f"{row_commit} != {current_commit}"
            )
        if row_commit:
            commits[service] = row_commit

        reference = str(
            row.get("immutable_reference")
            or row.get("image")
            or row.get("digest")
            or ""
        )
        digest = extract_digest(reference, service)

        if "@" in reference:
            expected_reference = f"{REGISTRY_PROJECT}/{service}@{digest}"
            if reference != expected_reference:
                die(
                    f"{service} immutable reference is not the expected "
                    f"Harbor repository"
                )

        digests[service] = digest

    if set(digests) != set(EXPECTED_SERVICES):
        missing = sorted(set(EXPECTED_SERVICES) - set(digests))
        extra = sorted(set(digests) - set(EXPECTED_SERVICES))
        die(f"source manifest service set mismatch missing={missing} extra={extra}")

    if current_commit and commits and set(commits) != set(EXPECTED_SERVICES):
        missing_commits = sorted(set(EXPECTED_SERVICES) - set(commits))
        die(f"source commits missing for services: {missing_commits}")

    return digests


def update_kustomization(
    kustomization: Path,
    digests: dict[str, str],
) -> list[dict[str, str]]:
    lines = kustomization.read_text(encoding="utf-8").splitlines(keepends=True)
    in_images = False
    current_service = ""
    image_names: list[str] = []
    new_names: dict[str, str] = {}
    old_digests: dict[str, str] = {}
    changed = False

    for index, line in enumerate(lines):
        if line.strip() == "images:" and not line.startswith((" ", "\t")):
            in_images = True
            current_service = ""
            continue

        if in_images and line.strip() and not line.startswith((" ", "\t")):
            in_images = False
            current_service = ""

        if not in_images:
            continue

        name_match = IMAGE_NAME_RE.match(line)
        if name_match:
            current_service = name_match.group(1)
            image_names.append(current_service)
            continue

        if not current_service:
            continue

        new_name_match = NEW_NAME_RE.match(line)
        if new_name_match:
            new_names[current_service] = new_name_match.group(1)
            continue

        digest_match = DIGEST_LINE_RE.match(line)
        if digest_match:
            old_digests[current_service] = digest_match.group(1)
            if current_service in digests:
                replacement = f"    digest: {digests[current_service]}\n"
                if line != replacement:
                    lines[index] = replacement
                    changed = True

    if len(image_names) != 6:
        die(f"expected six staging image entries, found {len(image_names)}")

    duplicate_names = sorted(
        name for name in set(image_names) if image_names.count(name) > 1
    )
    if duplicate_names:
        die(f"duplicate staging image entries: {duplicate_names}")

    if set(image_names) != set(EXPECTED_SERVICES):
        missing = sorted(set(EXPECTED_SERVICES) - set(image_names))
        extra = sorted(set(image_names) - set(EXPECTED_SERVICES))
        die(f"staging image entry mismatch missing={missing} extra={extra}")

    for service in EXPECTED_SERVICES:
        expected_new_name = f"{REGISTRY_PROJECT}/{service}"
        if new_names.get(service) != expected_new_name:
            die(
                f"{service} newName must remain {expected_new_name}, "
                f"found {new_names.get(service) or 'missing'}"
            )
        if service not in old_digests:
            die(f"{service} staging digest line is missing")

    if changed:
        kustomization.write_text("".join(lines), encoding="utf-8")

    return [
        {
            "service": service,
            "old_digest": old_digests[service],
            "new_digest": digests[service],
            "image": f"{REGISTRY_PROJECT}/{service}@{digests[service]}",
            "changed": str(old_digests[service] != digests[service]).lower(),
        }
        for service in EXPECTED_SERVICES
    ]


def write_reports(report_dir: Path, rows: list[dict[str, str]]) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)

    summary = {
        "services": len(rows),
        "changed": sum(1 for row in rows if row["changed"] == "true"),
        "images": rows,
        "validation_passed": True,
    }

    (report_dir / "staging-digest-promotion-summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    (report_dir / "expected-images.txt").write_text(
        "".join(f"{row['image']}\n" for row in rows),
        encoding="utf-8",
    )

    lines = [
        f"{row['service']} {row['old_digest']} -> {row['new_digest']}"
        for row in rows
    ]
    (report_dir / "staging-digest-promotion.txt").write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        default="reports/phase-13-release-manifest/vault-bank-release-manifest.json",
    )
    parser.add_argument(
        "--kustomization",
        default="gitops/overlays/staging/kustomization.yaml",
    )
    parser.add_argument(
        "--report-dir",
        default="reports/phase-13-gitops-promotion",
    )
    parser.add_argument("--current-commit", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    digests = load_digests(Path(args.source), args.current_commit)
    rows = update_kustomization(Path(args.kustomization), digests)
    write_reports(Path(args.report_dir), rows)

    print(
        "PASS: staging kustomization contains six validated "
        "Harbor image digests"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
