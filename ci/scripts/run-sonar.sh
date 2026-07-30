#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-04-sonarqube"

SONAR_TOKEN="${SONAR_TOKEN:-}"
SONAR_HOST_URL="${SONAR_HOST_URL:-https://sonarcloud.io}"
SONAR_ORGANIZATION="${SONAR_ORGANIZATION:-}"
SONAR_SCANNER_IMAGE="${SONAR_SCANNER_IMAGE:-sonarsource/sonar-scanner-cli:latest}"

[ -n "${SONAR_TOKEN}" ] || die "SONAR_TOKEN is required from Jenkins credential sonarqube-token"
[ -f "${ROOT_DIR}/sonar-project.properties" ] || die "sonar-project.properties is required"

scanner_args=(
  "-Dsonar.host.url=${SONAR_HOST_URL}"
  "-Dsonar.projectVersion=$(ci_image_tag)"
)

if [ -n "${SONAR_ORGANIZATION}" ]; then
  scanner_args+=("-Dsonar.organization=${SONAR_ORGANIZATION}")
fi

cd "${ROOT_DIR}"
if command -v sonar-scanner >/dev/null 2>&1; then
  SONAR_TOKEN="${SONAR_TOKEN}" run_logged "sonar-analysis" sonar-scanner \
    "-Dsonar.projectBaseDir=${ROOT_DIR}" \
    "${scanner_args[@]}"
else
  require_command docker
  docker pull "${SONAR_SCANNER_IMAGE}" > "${REPORT_DIR}/sonar-pull.log" 2> "${REPORT_DIR}/sonar-pull.err.log"
  run_logged "sonar-analysis" docker run --rm \
    -e SONAR_TOKEN="${SONAR_TOKEN}" \
    -v "${ROOT_DIR}:/usr/src:ro" \
    "${SONAR_SCANNER_IMAGE}" \
    "-Dsonar.projectBaseDir=/usr/src" \
    "${scanner_args[@]}"
fi

log "PASS: SonarQube analysis submitted"
