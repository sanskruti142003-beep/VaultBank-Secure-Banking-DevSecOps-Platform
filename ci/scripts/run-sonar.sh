#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

SONAR_PROJECT_KEY="${SONAR_PROJECT_KEY:-vaultbank}"
SONAR_ORGANIZATION="${SONAR_ORGANIZATION:-}"
SONAR_HOST_URL="${SONAR_HOST_URL:-https://sonarcloud.io}"
SONAR_TOKEN="${SONAR_TOKEN:-}"
SONAR_IMAGE="${SONAR_IMAGE:-sonarsource/sonar-scanner-cli:latest}"

[ -n "${SONAR_TOKEN}" ] || die "SONAR_TOKEN is required"

scanner_args=(
  "-Dsonar.projectKey=${SONAR_PROJECT_KEY}"
  "-Dsonar.host.url=${SONAR_HOST_URL}"
  "-Dsonar.sources=backend-service/apps,backend-service/libs,frontend/src"
  "-Dsonar.tests=backend-service/apps,backend-service/libs"
  "-Dsonar.test.inclusions=**/*.spec.ts"
  "-Dsonar.javascript.lcov.reportPaths=backend-service/coverage/lcov.info"
  "-Dsonar.qualitygate.wait=true"
)

if [ -n "${SONAR_ORGANIZATION}" ]; then
  scanner_args+=("-Dsonar.organization=${SONAR_ORGANIZATION}")
fi

cd "${ROOT_DIR}"

if command -v sonar-scanner >/dev/null 2>&1; then
  run_logged "sonar-sast-quality-gate" sonar-scanner "${scanner_args[@]}" "-Dsonar.token=${SONAR_TOKEN}"
else
  require_command docker
  docker pull "${SONAR_IMAGE}" > "${REPORT_DIR}/sonar-pull.log" 2> "${REPORT_DIR}/sonar-pull.err.log"
  run_logged "sonar-sast-quality-gate" docker run --rm \
    -e SONAR_TOKEN="${SONAR_TOKEN}" \
    -v "${ROOT_DIR}:/usr/src:ro" \
    "${SONAR_IMAGE}" \
    "${scanner_args[@]}" "-Dsonar.token=${SONAR_TOKEN}"
fi

log "PASS: SonarCloud/SonarQube SAST quality gate"
