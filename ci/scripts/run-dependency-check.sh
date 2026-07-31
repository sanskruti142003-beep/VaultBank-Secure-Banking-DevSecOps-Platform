#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"

VERSIONS_FILE="${ROOT_DIR}/config/tool-versions.env"
POLICY_FILE="${ROOT_DIR}/config/pipeline-policy.yml"
SUPPRESSION_FILE="${ROOT_DIR}/config/security/dependency-check-suppression.xml"

REPORT_ROOT="${REPORT_ROOT:-${ROOT_DIR}/reports}"
REPORT_DIR="${REPORT_ROOT}/phase-05-dependency-check"

DATA_DIR="${DEPENDENCY_CHECK_DATA_DIR:-/var/lib/jenkins/dependency-check-data}"

RUNTIME_DIR="${DEPENDENCY_CHECK_RUNTIME_DIR:-/var/lib/jenkins/dependency-check-runtime}"

SECRET_FILE=""

log() {
  printf '[%s] %s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 ||
    die "Missing required command: $1"
}

cleanup() {
  if [ -n "${SECRET_FILE}" ] &&
     [ -f "${SECRET_FILE}" ]; then
    chmod 600 "${SECRET_FILE}" 2>/dev/null || true

    if command -v shred >/dev/null 2>&1; then
      shred \
        --force \
        --remove \
        "${SECRET_FILE}" \
        2>/dev/null ||
        rm -f "${SECRET_FILE}"
    else
      rm -f "${SECRET_FILE}"
    fi
  fi
}

trap cleanup EXIT

require_command docker
require_command git
require_command awk
require_command grep
require_command find
require_command python3

[ -f "${VERSIONS_FILE}" ] ||
  die "Missing tool-version policy: ${VERSIONS_FILE}"

[ -f "${POLICY_FILE}" ] ||
  die "Missing pipeline policy: ${POLICY_FILE}"

[ -f "${SUPPRESSION_FILE}" ] ||
  die "Missing suppression policy: ${SUPPRESSION_FILE}"

# shellcheck disable=SC1090
source "${VERSIONS_FILE}"

DEPENDENCY_CHECK_IMAGE="${DEPENDENCY_CHECK_IMAGE:-}"

DEPENDENCY_CHECK_VERSION="${DEPENDENCY_CHECK_VERSION:-}"

NVD_API_KEY="${NVD_API_KEY:-}"

[ -n "${DEPENDENCY_CHECK_IMAGE}" ] ||
  die "DEPENDENCY_CHECK_IMAGE is missing"

[ -n "${DEPENDENCY_CHECK_VERSION}" ] ||
  die "DEPENDENCY_CHECK_VERSION is missing"

[ -n "${NVD_API_KEY}" ] ||
  die \
    "NVD_API_KEY is required from Jenkins credential nvd-api-key"

case "${DEPENDENCY_CHECK_IMAGE}" in
  *:latest*)
    die "Dependency-Check latest tag is prohibited"
    ;;
esac

if [[ "${DEPENDENCY_CHECK_IMAGE}" != *@sha256:* ]]; then
  die "Dependency-Check image must be pinned by digest"
fi

POLICY_THRESHOLD="$(
  awk '
    $1 == "dependency_check_fail_on_cvss:" {
      print $2
      exit
    }
  ' "${POLICY_FILE}"
)"

[ -n "${POLICY_THRESHOLD}" ] ||
  die \
    "dependency_check_fail_on_cvss is missing from pipeline policy"

DEPENDENCY_CHECK_FAIL_ON_CVSS="${
  DEPENDENCY_CHECK_FAIL_ON_CVSS:-
  ${POLICY_THRESHOLD}
}"

if [ "${DEPENDENCY_CHECK_FAIL_ON_CVSS}" != "${POLICY_THRESHOLD}" ]; then
  die \
    "Dependency-Check threshold override differs from pipeline policy"
fi

if [ "${DEPENDENCY_CHECK_FAIL_ON_CVSS}" != "7.0" ]; then
  die \
    "Dependency-Check CVSS threshold must remain 7.0"
fi

BACKEND_LOCKFILE="${ROOT_DIR}/backend-service/package-lock.json"

FRONTEND_LOCKFILE="${ROOT_DIR}/frontend/package-lock.json"

[ -s "${BACKEND_LOCKFILE}" ] ||
  die "Backend package-lock.json is missing or empty"

[ -s "${FRONTEND_LOCKFILE}" ] ||
  die "Frontend package-lock.json is missing or empty"

[ -d "${DATA_DIR}" ] ||
  die "Dependency-Check data directory does not exist: ${DATA_DIR}"

[ -w "${DATA_DIR}" ] ||
  die "Dependency-Check data directory is not writable: ${DATA_DIR}"

[ -d "${RUNTIME_DIR}" ] ||
  die \
    "Dependency-Check runtime directory does not exist: ${RUNTIME_DIR}"

[ -w "${RUNTIME_DIR}" ] ||
  die \
    "Dependency-Check runtime directory is not writable: ${RUNTIME_DIR}"

mkdir -p "${REPORT_DIR}"

rm -f \
  "${REPORT_DIR}"/dependency-check-report.* \
  "${REPORT_DIR}"/dependency-check-junit.xml \
  "${REPORT_DIR}"/dependency-check.log \
  "${REPORT_DIR}"/dependency-check-metadata.txt \
  "${REPORT_DIR}"/dependency-check-image-pull.log

python3 \
  "${ROOT_DIR}/ci/scripts/validate-security-exceptions.py"

umask 077

SECRET_FILE="$(
  mktemp \
    "${RUNTIME_DIR}/nvd.XXXXXX.properties"
)"

cat > "${SECRET_FILE}" <<PROPERTIES
nvd.api.key=${NVD_API_KEY}
nvd.api.check.validforhours=4
nvd.api.max.retry.count=10
PROPERTIES

chmod 600 "${SECRET_FILE}"

printf '%s\n' \
  "version=${DEPENDENCY_CHECK_VERSION}" \
  "image=${DEPENDENCY_CHECK_IMAGE}" \
  "threshold=${DEPENDENCY_CHECK_FAIL_ON_CVSS}" \
  "backend_lockfile=backend-service/package-lock.json" \
  "frontend_lockfile=frontend/package-lock.json" \
  > "${REPORT_DIR}/dependency-check-metadata.txt"

chmod 640 \
  "${REPORT_DIR}/dependency-check-metadata.txt"

log \
  "Pulling immutable Dependency-Check image"

docker pull \
  "${DEPENDENCY_CHECK_IMAGE}" \
  > "${REPORT_DIR}/dependency-check-image-pull.log" \
  2>&1

log \
  "Starting OWASP Dependency-Check ${DEPENDENCY_CHECK_VERSION}"

set +e

docker run \
  --rm \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --tmpfs /tmp:rw,nosuid,nodev,size=512m \
  --volume "${ROOT_DIR}:/src:ro" \
  --volume "${DATA_DIR}:/usr/share/dependency-check/data" \
  --volume "${REPORT_DIR}:/report" \
  --volume \
    "${SECRET_FILE}:/run/secrets/dependency-check.properties:ro" \
  "${DEPENDENCY_CHECK_IMAGE}" \
  --project "Vault Bank" \
  --scan "/src/backend-service/package-lock.json" \
  --scan "/src/frontend/package-lock.json" \
  --format "HTML" \
  --format "JSON" \
  --format "JUNIT" \
  --format "SARIF" \
  --prettyPrint \
  --out "/report" \
  --log "/report/dependency-check.log" \
  --failOnCVSS "${DEPENDENCY_CHECK_FAIL_ON_CVSS}" \
  --junitFailOnCVSS "${DEPENDENCY_CHECK_FAIL_ON_CVSS}" \
  --suppression \
    "/src/config/security/dependency-check-suppression.xml" \
  --propertyfile \
    "/run/secrets/dependency-check.properties" \
  --disableAssembly \
  --disableOssIndex \
  --disableNodeAudit \
  --disableYarnAudit \
  --disablePnpmAudit

SCAN_EXIT=$?

set -e

cleanup
SECRET_FILE=""

JSON_REPORT="${REPORT_DIR}/dependency-check-report.json"

HTML_REPORT="${REPORT_DIR}/dependency-check-report.html"

SARIF_REPORT="${REPORT_DIR}/dependency-check-report.sarif"

JUNIT_REPORT="${REPORT_DIR}/dependency-check-junit.xml"

[ -s "${JSON_REPORT}" ] ||
  die \
    "Dependency-Check JSON report was not generated"

[ -s "${HTML_REPORT}" ] ||
  die \
    "Dependency-Check HTML report was not generated"

[ -s "${SARIF_REPORT}" ] ||
  die \
    "Dependency-Check SARIF report was not generated"

[ -s "${JUNIT_REPORT}" ] ||
  die \
    "Dependency-Check JUnit report was not generated"

if grep \
  --recursive \
  --fixed-strings \
  --files-with-matches \
  -- "${NVD_API_KEY}" \
  "${REPORT_DIR}" \
  >/dev/null 2>&1; then
  die \
    "NVD API key appeared in Dependency-Check output"
fi

find "${REPORT_DIR}" \
  -maxdepth 1 \
  -type f \
  -exec chmod 640 {} +

if find "${RUNTIME_DIR}" \
  -mindepth 1 \
  -maxdepth 1 \
  -type f \
  -name 'nvd.*.properties' \
  -print |
  grep -q .; then
  die \
    "Temporary NVD property file remains after scan"
fi

if [ "${SCAN_EXIT}" -ne 0 ]; then
  die \
    "Dependency-Check failed or found CVSS >= ${DEPENDENCY_CHECK_FAIL_ON_CVSS}; inspect reports"
fi

log \
  "PASS: OWASP Dependency-Check CVSS ${DEPENDENCY_CHECK_FAIL_ON_CVSS} gate"
