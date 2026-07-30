#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-09-sbom"

IMAGE_LIST="${IMAGE_LIST:-${ROOT_DIR}/reports/phase-07-build/images.txt}"
[ -s "${IMAGE_LIST}" ] || die "image list not found: ${IMAGE_LIST}; run build-images.sh first"

require_command syft
require_command python3

: > "${REPORT_DIR}/sbom-manifest.jsonl"

while IFS= read -r image; do
  [ -n "${image}" ] || continue
  repo="${image%:*}"
  service="${repo##*/}"
  cdx="${REPORT_DIR}/${service}.cdx.json"
  spdx="${REPORT_DIR}/${service}.spdx.json"

  run_logged "syft-cyclonedx-${service}" syft "${image}" -o "cyclonedx-json=${cdx}"
  run_logged "syft-spdx-${service}" syft "${image}" -o "spdx-json=${spdx}"

  python3 - "$cdx" "$spdx" <<'PY'
import json
import sys

for path in sys.argv[1:]:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    components = data.get("components") or data.get("packages") or []
    if not components:
        raise SystemExit(f"SBOM has no components/packages: {path}")
    text = json.dumps(data).lower()
    for marker in ("private key", "password=", "secret=", "token="):
        if marker in text:
            raise SystemExit(f"SBOM may contain secret marker {marker!r}: {path}")
PY

  cdx_sha="$(sha256sum "${cdx}" | awk '{print $1}')"
  spdx_sha="$(sha256sum "${spdx}" | awk '{print $1}')"
  printf '%s  %s\n' "${cdx_sha}" "$(basename "${cdx}")" >> "${REPORT_DIR}/SHA256SUMS"
  printf '%s  %s\n' "${spdx_sha}" "$(basename "${spdx}")" >> "${REPORT_DIR}/SHA256SUMS"
  python3 - "$REPORT_DIR/sbom-manifest.jsonl" "$service" "$image" "$cdx" "$spdx" "$cdx_sha" "$spdx_sha" <<'PY'
import json
import sys

path, service, image, cdx, spdx, cdx_sha, spdx_sha = sys.argv[1:]
with open(path, "a", encoding="utf-8") as handle:
    handle.write(json.dumps({
        "service": service,
        "local_image": image,
        "cyclonedx": cdx,
        "spdx": spdx,
        "cyclonedx_sha256": cdx_sha,
        "spdx_sha256": spdx_sha,
    }, sort_keys=True) + "\n")
PY
done < "${IMAGE_LIST}"

(cd "${REPORT_DIR}" && sha256sum -c SHA256SUMS)

log "PASS: twelve SBOM files and checksums"
