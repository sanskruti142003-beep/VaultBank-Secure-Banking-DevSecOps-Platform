#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-08-trivy-image"

TRIVY_IGNORE_FILE="${ROOT_DIR}/.trivyignore.yaml"
IMAGE_LIST="${IMAGE_LIST:-${ROOT_DIR}/reports/phase-07-build/images.txt}"

[ -s "${IMAGE_LIST}" ] || die "image list not found: ${IMAGE_LIST}; run build-images.sh first"
require_command trivy

mkdir -p "${REPORT_DIR}/json" "${REPORT_DIR}/sarif"

while IFS= read -r image; do
  [ -n "${image}" ] || continue
  name="$(safe_name "${image}")"

  run_logged "trivy-image-critical-${name}" trivy image \
    --scanners vuln \
    --severity CRITICAL \
    --exit-code 1 \
    --ignorefile "${TRIVY_IGNORE_FILE}" \
    --format json \
    --output "${REPORT_DIR}/json/${name}.critical.json" \
    "${image}"

  run_logged "trivy-image-fixable-high-${name}" trivy image \
    --scanners vuln \
    --severity HIGH \
    --ignore-unfixed \
    --exit-code 1 \
    --ignorefile "${TRIVY_IGNORE_FILE}" \
    --format json \
    --output "${REPORT_DIR}/json/${name}.fixable-high.json" \
    "${image}"

  run_logged "trivy-image-secret-misconfig-${name}" trivy image \
    --image-config-scanners misconfig,secret \
    --severity HIGH,CRITICAL \
    --exit-code 1 \
    --ignorefile "${TRIVY_IGNORE_FILE}" \
    --format sarif \
    --output "${REPORT_DIR}/sarif/${name}.secret-misconfig.sarif" \
    "${image}"
done < "${IMAGE_LIST}"

log "PASS: six Trivy image gates"
