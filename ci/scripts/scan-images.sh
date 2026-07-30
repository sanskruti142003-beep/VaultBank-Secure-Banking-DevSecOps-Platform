#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:latest}"
TRIVY_IMAGE_SEVERITY="${TRIVY_IMAGE_SEVERITY:-HIGH,CRITICAL}"
TRIVY_CACHE_DIR="${TRIVY_CACHE_DIR:-${ROOT_DIR}/.trivy-cache}"
IMAGE_LIST="${IMAGE_LIST:-${REPORT_DIR}/images.txt}"

[ -s "${IMAGE_LIST}" ] || die "image list not found: ${IMAGE_LIST}; run build-images.sh first"
mkdir -p "${TRIVY_CACHE_DIR}" "${REPORT_DIR}/image-scans"

scan_one() {
  local image="$1"
  local safe_name
  safe_name="$(printf '%s' "${image}" | tr '/:@' '____')"

  if command -v trivy >/dev/null 2>&1; then
    run_logged "trivy-image-${safe_name}" trivy image \
      --severity "${TRIVY_IMAGE_SEVERITY}" \
      --exit-code 1 \
      --ignore-unfixed \
      --format sarif \
      --output "${REPORT_DIR}/image-scans/${safe_name}.sarif" \
      "${image}"
  else
    require_command docker
    docker pull "${TRIVY_IMAGE}" > "${REPORT_DIR}/trivy-image-pull.log" 2> "${REPORT_DIR}/trivy-image-pull.err.log" || true
    run_logged "trivy-image-${safe_name}" docker run --rm \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v "${TRIVY_CACHE_DIR}:/root/.cache" \
      -v "${REPORT_DIR}/image-scans:/reports" \
      "${TRIVY_IMAGE}" image \
      --severity "${TRIVY_IMAGE_SEVERITY}" \
      --exit-code 1 \
      --ignore-unfixed \
      --format sarif \
      --output "/reports/${safe_name}.sarif" \
      "${image}"
  fi
}

while IFS= read -r image; do
  [ -n "${image}" ] || continue
  scan_one "${image}"
done < "${IMAGE_LIST}"

log "PASS: Trivy image scan"
