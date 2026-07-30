#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-05-dependency-check"

DEPENDENCY_CHECK_FAIL_ON_CVSS="${DEPENDENCY_CHECK_FAIL_ON_CVSS:-7}"
DEPENDENCY_CHECK_IMAGE="${DEPENDENCY_CHECK_IMAGE:-owasp/dependency-check:latest}"
NVD_API_KEY="${NVD_API_KEY:-}"
DATA_DIR="${DEPENDENCY_CHECK_DATA_DIR:-${ROOT_DIR}/.dependency-check-data}"
SUPPRESSION_FILE="${ROOT_DIR}/config/security/dependency-check-suppression.xml"

[ -f "${SUPPRESSION_FILE}" ] || die "Dependency-Check suppression policy is missing"
mkdir -p "${DATA_DIR}" "${REPORT_DIR}"
require_command python3

args=(
  "--project" "vaultbank"
  "--scan" "${ROOT_DIR}/backend-service/package-lock.json"
  "--scan" "${ROOT_DIR}/frontend/package-lock.json"
  "--format" "HTML"
  "--format" "JSON"
  "--format" "JUNIT"
  "--format" "SARIF"
  "--out" "${REPORT_DIR}"
  "--failOnCVSS" "${DEPENDENCY_CHECK_FAIL_ON_CVSS}"
  "--suppression" "${SUPPRESSION_FILE}"
  "--disableAssembly"
)

if [ -n "${NVD_API_KEY}" ]; then
  args+=("--nvdApiKey" "${NVD_API_KEY}")
fi

python3 "${SCRIPT_DIR}/validate-security-exceptions.py"

if command -v dependency-check.sh >/dev/null 2>&1; then
  run_logged "dependency-check-sca" dependency-check.sh "${args[@]}"
else
  require_command docker
  docker pull "${DEPENDENCY_CHECK_IMAGE}" > "${REPORT_DIR}/dependency-check-pull.log" 2> "${REPORT_DIR}/dependency-check-pull.err.log"
  docker_args=(
    --project "vaultbank"
    --scan "/src/backend-service/package-lock.json"
    --scan "/src/frontend/package-lock.json"
    --format "HTML"
    --format "JSON"
    --format "JUNIT"
    --format "SARIF"
    --out "/report"
    --failOnCVSS "${DEPENDENCY_CHECK_FAIL_ON_CVSS}"
    --suppression "/src/config/security/dependency-check-suppression.xml"
    --disableAssembly
  )
  if [ -n "${NVD_API_KEY}" ]; then
    docker_args+=(--nvdApiKey "${NVD_API_KEY}")
  fi
  run_logged "dependency-check-sca" docker run --rm \
    -v "${ROOT_DIR}:/src:ro" \
    -v "${DATA_DIR}:/usr/share/dependency-check/data" \
    -v "${REPORT_DIR}:/report" \
    "${DEPENDENCY_CHECK_IMAGE}" "${docker_args[@]}"
fi

log "PASS: OWASP Dependency-Check SCA"
