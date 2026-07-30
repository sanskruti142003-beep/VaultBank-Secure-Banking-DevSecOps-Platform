#!/usr/bin/env python3
"""Create the phase-10 release manifest from Harbor digest evidence."""

from __future__ import annotations

import json
import os
from pathlib import Path


def main() -> int:
    root = Path(os.environ.get("ROOT_DIR", Path.cwd()))
    report_root = Path(os.environ.get("REPORT_ROOT", root / "reports"))
    phase_dir = Path(os.environ.get("REPORT_DIR", report_root / "phase-10-harbor"))
    digest_file = phase_dir / "digest-manifest.jsonl"
    status_dir = phase_dir / "status"
    output = phase_dir / "release-manifest.json"

    if not digest_file.exists():
        raise SystemExit(f"missing digest manifest: {digest_file}")

    rows = [json.loads(line) for line in digest_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(rows) != 6:
        raise SystemExit(f"expected 6 Harbor digest entries, found {len(rows)}")

    required_statuses = {
        "trivy-pass": "trivy_result",
        "signed": "cosign_signed",
        "attested": "sbom_attested",
        "signature-verified": "cosign_signature_verified",
        "attestation-verified": "sbom_attestation_verified",
    }

    for row in rows:
        service = row["service"]
        for suffix, field in required_statuses.items():
            path = status_dir / f"{service}.{suffix}"
            row[field] = path.exists()
            if not row[field]:
                raise SystemExit(f"{service} missing required phase-10 status: {suffix}")

    output.write_text(json.dumps({"images": rows}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"PASS: release manifest written to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
