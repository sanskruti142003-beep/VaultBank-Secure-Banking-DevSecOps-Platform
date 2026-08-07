#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-04-sonarcloud"

VERSIONS_FILE="${ROOT_DIR}/config/tool-versions.env"
PROJECT_PROPERTIES="${ROOT_DIR}/sonar-project.properties"
LCOV_REPORT="${ROOT_DIR}/backend-service/coverage/lcov.info"

[ -f "${VERSIONS_FILE}" ] ||
  die "Missing tool-version policy: ${VERSIONS_FILE}"

# shellcheck disable=SC1090
source "${VERSIONS_FILE}"

SONAR_TOKEN="${SONAR_TOKEN:-}"
SONAR_HOST_URL="${SONAR_HOST_URL:-https://sonarcloud.io}"
SONAR_HOST_URL="${SONAR_HOST_URL%/}"
SONAR_USER_HOME="${SONAR_USER_HOME:-${HOME}/.sonar}"
SONAR_QUALITY_GATE_TIMEOUT="${SONAR_QUALITY_GATE_TIMEOUT:-300}"
SONAR_SYNC_QUALITY_GATE="${SONAR_SYNC_QUALITY_GATE:-0}"
SONAR_ALLOW_QUALITY_GATE_MUTATION="${SONAR_ALLOW_QUALITY_GATE_MUTATION:-0}"
SONAR_SERVER_QUALITY_GATE_WAIT="${SONAR_SERVER_QUALITY_GATE_WAIT:-false}"

[ -n "${SONAR_TOKEN}" ] ||
  die "SONAR_TOKEN is required from Jenkins credential sonarcloud-token or sonarqube-token"

[ -f "${PROJECT_PROPERTIES}" ] ||
  die "Missing sonar-project.properties"

[ -s "${LCOV_REPORT}" ] ||
  die "Missing or empty LCOV report: ${LCOV_REPORT}"

require_command sonar-scanner
require_command sha256sum
require_command awk
require_command grep

project_key="$(
  awk -F= \
    '$1 == "sonar.projectKey" {
      print substr($0, index($0, "=") + 1)
      exit
    }' \
    "${PROJECT_PROPERTIES}"
)"

organization_key="$(
  awk -F= \
    '$1 == "sonar.organization" {
      print substr($0, index($0, "=") + 1)
      exit
    }' \
    "${PROJECT_PROPERTIES}"
)"

[ -n "${project_key}" ] ||
  die "sonar.projectKey is missing"

[ -n "${organization_key}" ] ||
  die "sonar.organization is missing"

scanner_version_output="$(sonar-scanner --version 2>&1)"

printf '%s\n' "${scanner_version_output}" \
  > "${REPORT_DIR}/sonar-scanner-version.txt"

if ! printf '%s\n' "${scanner_version_output}" |
     grep -Fq "${SONAR_SCANNER_VERSION}"; then
  die \
    "SonarScanner version mismatch: expected ${SONAR_SCANNER_VERSION}"
fi

mkdir -p "${SONAR_USER_HOME}"

sha256sum "${LCOV_REPORT}" \
  > "${REPORT_DIR}/lcov-sha256.txt"

wc -c "${LCOV_REPORT}" \
  > "${REPORT_DIR}/lcov-size.txt"

printf 'projectKey=%s\norganization=%s\nhost=%s\n' \
  "${project_key}" \
  "${organization_key}" \
  "${SONAR_HOST_URL}" \
  > "${REPORT_DIR}/sonar-analysis-metadata.txt"

export SONAR_TOKEN
export SONAR_USER_HOME

if [ "${SONAR_SYNC_QUALITY_GATE}" = "1" ] &&
   [ "${SONAR_ALLOW_QUALITY_GATE_MUTATION}" = "1" ]; then
  REPORT_DIR="${REPORT_DIR}" \
    RUN_ID="${RUN_ID}" \
    SONAR_HOST_URL="${SONAR_HOST_URL}" \
    SONAR_TOKEN="${SONAR_TOKEN}" \
    bash "${SCRIPT_DIR}/configure-sonar-quality-gate.sh"
elif [ "${SONAR_SYNC_QUALITY_GATE}" = "1" ]; then
  log \
    "Skipping Sonar quality gate sync because SONAR_ALLOW_QUALITY_GATE_MUTATION=${SONAR_ALLOW_QUALITY_GATE_MUTATION}"
else
  log "Skipping Sonar quality gate sync because SONAR_SYNC_QUALITY_GATE=${SONAR_SYNC_QUALITY_GATE}"
fi

cd "${ROOT_DIR}"

run_logged \
  "sonar-analysis" \
  sonar-scanner \
  "-Dsonar.host.url=${SONAR_HOST_URL}" \
  "-Dsonar.projectVersion=$(ci_image_tag)" \
  "-Dsonar.qualitygate.wait=${SONAR_SERVER_QUALITY_GATE_WAIT}" \
  "-Dsonar.qualitygate.timeout=${SONAR_QUALITY_GATE_TIMEOUT}"

if [ -f "${ROOT_DIR}/.scannerwork/report-task.txt" ]; then
  cp \
    "${ROOT_DIR}/.scannerwork/report-task.txt" \
    "${REPORT_DIR}/report-task.txt"
fi

REPORT_DIR="${REPORT_DIR}" \
  RUN_ID="${RUN_ID}" \
  SONAR_HOST_URL="${SONAR_HOST_URL}" \
  SONAR_TOKEN="${SONAR_TOKEN}" \
  bash "${SCRIPT_DIR}/evaluate-sonar-policy.sh"

unset SONAR_TOKEN

log "PASS: SonarQube Cloud analysis and effective Quality Gate passed"
