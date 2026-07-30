#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

BASE_URL="${GATEWAY_BASE_URL:-https://127.0.0.1}"
CURL_MAX_TIME_SECONDS="${CURL_MAX_TIME_SECONDS:-10}"

require_command curl

curl_route() {
  local path="$1"
  local output="$2"
  curl --fail --silent --show-error --insecure --max-time "${CURL_MAX_TIME_SECONDS}" \
    "${BASE_URL}${path}" > "${REPORT_DIR}/${output}.json"
}

for route in auth accounts transactions payments notifications; do
  curl_route "/health/${route}" "health-${route}"
  curl_route "/metrics/${route}" "metrics-${route}"
done

log "PASS: gateway smoke tests"
