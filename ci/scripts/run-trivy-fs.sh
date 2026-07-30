#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:latest}"
TRIVY_FS_SEVERITY="${TRIVY_FS_SEVERITY:-HIGH,CRITICAL}"
TRIVY_CACHE_DIR="${TRIVY_CACHE_DIR:-${ROOT_DIR}/.trivy-cache}"

mkdir -p "${TRIVY_CACHE_DIR}"

trivy_args=(
  "fs"
  "--scanners" "vuln,secret,misconfig"
  "--severity" "${TRIVY_FS_SEVERITY}"
  "--exit-code" "1"
  "--ignore-unfixed"
  "--format" "sarif"
  "--output" "${REPORT_DIR}/trivy-fs.sarif"
  "${ROOT_DIR}"
)

if command -v trivy >/dev/null 2>&1; then
  run_logged "trivy-filesystem-config-scan" trivy "${trivy_args[@]}"
else
  require_command docker
  docker pull "${TRIVY_IMAGE}" > "${REPORT_DIR}/trivy-pull.log" 2> "${REPORT_DIR}/trivy-pull.err.log"
  run_logged "trivy-filesystem-config-scan" docker run --rm \
    -v "${ROOT_DIR}:/work:ro" \
    -v "${TRIVY_CACHE_DIR}:/root/.cache" \
    "${TRIVY_IMAGE}" \
    fs \
    --scanners vuln,secret,misconfig \
    --severity "${TRIVY_FS_SEVERITY}" \
    --exit-code 1 \
    --ignore-unfixed \
    --format sarif \
    --output "/work/reports/devsecops/${RUN_ID}/trivy-fs.sarif" \
    /work
fi

log "PASS: Trivy filesystem/config scan"
