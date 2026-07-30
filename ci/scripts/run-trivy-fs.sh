#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-06-trivy-fs"

TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:latest}"
TRIVY_CACHE_DIR="${TRIVY_CACHE_DIR:-${ROOT_DIR}/.trivy-cache}"
TRIVY_IGNORE_FILE="${ROOT_DIR}/.trivyignore.yaml"

mkdir -p "${TRIVY_CACHE_DIR}" "${REPORT_DIR}"
python3 "${SCRIPT_DIR}/validate-security-exceptions.py"

run_trivy_cli() {
  local name="$1"
  shift
  require_command trivy
  run_logged "${name}" trivy "$@"
}

run_trivy_cli "trivy-fs-critical-vuln" fs \
  --scanners vuln \
  --severity CRITICAL \
  --exit-code 1 \
  --ignorefile "${TRIVY_IGNORE_FILE}" \
  --format json \
  --output "${REPORT_DIR}/critical-vulnerabilities.json" \
  "${ROOT_DIR}"

run_trivy_cli "trivy-fs-fixable-high-vuln" fs \
  --scanners vuln \
  --severity HIGH \
  --ignore-unfixed \
  --exit-code 1 \
  --ignorefile "${TRIVY_IGNORE_FILE}" \
  --format json \
  --output "${REPORT_DIR}/fixable-high-vulnerabilities.json" \
  "${ROOT_DIR}"

run_trivy_cli "trivy-fs-secret-misconfig" fs \
  --scanners misconfig,secret \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  --ignorefile "${TRIVY_IGNORE_FILE}" \
  --format sarif \
  --output "${REPORT_DIR}/secret-misconfig.sarif" \
  "${ROOT_DIR}"

log "PASS: Trivy filesystem/config scan"
