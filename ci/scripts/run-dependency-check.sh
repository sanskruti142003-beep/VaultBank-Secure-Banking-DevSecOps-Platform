#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

DEPENDENCY_CHECK_FAIL_ON_CVSS="${DEPENDENCY_CHECK_FAIL_ON_CVSS:-7}"
DEPENDENCY_CHECK_IMAGE="${DEPENDENCY_CHECK_IMAGE:-owasp/dependency-check:latest}"
NVD_API_KEY="${NVD_API_KEY:-}"
DATA_DIR="${DEPENDENCY_CHECK_DATA_DIR:-${ROOT_DIR}/.dependency-check-data}"
OUT_DIR="${REPORT_DIR}/dependency-check"

mkdir -p "${DATA_DIR}" "${OUT_DIR}"

args=(
  "--project" "vaultbank"
  "--scan" "${ROOT_DIR}/backend-service"
  "--scan" "${ROOT_DIR}/frontend"
  "--format" "HTML"
  "--format" "JSON"
  "--out" "${OUT_DIR}"
  "--failOnCVSS" "${DEPENDENCY_CHECK_FAIL_ON_CVSS}"
  "--disableAssembly"
)

if [ -n "${NVD_API_KEY}" ]; then
  args+=("--nvdApiKey" "${NVD_API_KEY}")
fi

if command -v dependency-check.sh >/dev/null 2>&1; then
  run_logged "dependency-check-sca" dependency-check.sh "${args[@]}"
else
  require_command docker
  docker pull "${DEPENDENCY_CHECK_IMAGE}" > "${REPORT_DIR}/dependency-check-pull.log" 2> "${REPORT_DIR}/dependency-check-pull.err.log"
  docker_args=(
    --project "vaultbank"
    --scan "/src/backend-service"
    --scan "/src/frontend"
    --format "HTML"
    --format "JSON"
    --out "/report"
    --failOnCVSS "${DEPENDENCY_CHECK_FAIL_ON_CVSS}"
    --disableAssembly
  )
  if [ -n "${NVD_API_KEY}" ]; then
    docker_args+=(--nvdApiKey "${NVD_API_KEY}")
  fi
  run_logged "dependency-check-sca" docker run --rm \
    -v "${ROOT_DIR}:/src:ro" \
    -v "${DATA_DIR}:/usr/share/dependency-check/data" \
    -v "${OUT_DIR}:/report" \
    "${DEPENDENCY_CHECK_IMAGE}" "${docker_args[@]}"
fi

log "PASS: OWASP Dependency-Check SCA"
