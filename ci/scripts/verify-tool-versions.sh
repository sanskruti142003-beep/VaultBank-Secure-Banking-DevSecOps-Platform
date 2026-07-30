#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
VERSIONS_FILE="${ROOT_DIR}/config/tool-versions.env"
REPORT_DIR="${REPORT_ROOT:-${ROOT_DIR}/reports}/phase-03-tool-versions"

mkdir -p "${REPORT_DIR}"

[ -f "${VERSIONS_FILE}" ] || {
  echo "ERROR: missing ${VERSIONS_FILE}" >&2
  exit 1
}

# shellcheck disable=SC1090
source "${VERSIONS_FILE}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $1" >&2
    exit 1
  }
}

assert_version() {
  local tool="$1"
  local expected="$2"
  shift 2

  local output

  output="$("$@" 2>&1)"

  printf '%s\n' "${output}" \
    > "${REPORT_DIR}/${tool}-version.txt"

  if ! printf '%s\n' "${output}" |
       grep -Fq "${expected}"; then
    echo "ERROR: ${tool} version mismatch" >&2
    echo "Expected: ${expected}" >&2
    echo "Actual output:" >&2
    printf '%s\n' "${output}" >&2
    exit 1
  fi

  printf 'PASS: %s version %s\n' \
    "${tool}" \
    "${expected}"
}

require_command trufflehog
require_command trivy
require_command syft
require_command cosign

assert_version \
  "trufflehog" \
  "${TRUFFLEHOG_VERSION}" \
  trufflehog --version

assert_version \
  "trivy" \
  "${TRIVY_VERSION}" \
  trivy --version

assert_version \
  "syft" \
  "${SYFT_VERSION}" \
  syft version

assert_version \
  "cosign" \
  "${COSIGN_VERSION}" \
  cosign version

sha256sum \
  "$(command -v trufflehog)" \
  "$(command -v trivy)" \
  "$(command -v syft)" \
  "$(command -v cosign)" \
  > "${REPORT_DIR}/binary-sha256.txt"

echo "PASS: all security tool versions match repository policy"
