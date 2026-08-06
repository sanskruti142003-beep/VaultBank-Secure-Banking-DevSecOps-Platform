#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-14-zap-auth-discovery"

require_command curl

BASE_URL="${ZAP_TARGET_URL:-${GATEWAY_BASE_URL:-}}"
[ -n "${BASE_URL}" ] || die "ZAP_TARGET_URL or GATEWAY_BASE_URL is required"

BASE_URL="${BASE_URL%/}"
SELECTED_ROUTE_FILE="${REPORT_DIR}/selected-login-route.txt"
DISCOVERY_LOG="${REPORT_DIR}/discovery.log"
NEGATIVE_BODY="${REPORT_DIR}/negative-login.json"

: > "${DISCOVERY_LOG}"

candidate_routes="${ZAP_AUTH_CANDIDATE_ROUTES:-/v1/auth/login}"

curl_status() {
  local method="$1"
  local url="$2"
  local body="$3"
  local output="$4"

  curl \
    --silent \
    --show-error \
    --insecure \
    --request "${method}" \
    --header 'Content-Type: application/json' \
    --data "${body}" \
    --output "${output}" \
    --write-out '%{http_code}' \
    "${url}"
}

selected_route=""

for route in ${candidate_routes}; do
  response_file="${REPORT_DIR}/malformed-${route//[^A-Za-z0-9]/_}.json"
  code="$(curl_status POST "${BASE_URL}${route}" '{}' "${response_file}")"
  printf '%s malformed-status=%s\n' "${route}" "${code}" >> "${DISCOVERY_LOG}"

  case "${code}" in
    400)
      selected_route="${route}"
      break
      ;;
    405)
      continue
      ;;
    429)
      die "${route} is rate limited; do not clear Redis or bypass the limiter"
      ;;
    500)
      die "${route} returned 500 during malformed validation"
      ;;
    000)
      die "unable to reach ${BASE_URL}${route}"
      ;;
    *)
      continue
      ;;
  esac
done

[ -n "${selected_route}" ] ||
  die "no auth login route produced the expected 400 validation response"

printf '%s\n' "${selected_route}" > "${SELECTED_ROUTE_FILE}"
log "Selected login route: ${selected_route}"

negative_payload='{"username":"zap.invalid.customer","password":"InvalidPassword1","role":"customer"}'
negative_code="$(
  curl_status \
    POST \
    "${BASE_URL}${selected_route}" \
    "${negative_payload}" \
    "${NEGATIVE_BODY}"
)"

printf '%s negative-status=%s\n' "${selected_route}" "${negative_code}" \
  >> "${DISCOVERY_LOG}"

case "${negative_code}" in
  401)
    log "PASS: invalid credentials return 401 on ${selected_route}"
    ;;
  405)
    die "${selected_route} reached the wrong route and returned 405"
    ;;
  429)
    die "${selected_route} is in rate-limit state; wait for expiry and rerun"
    ;;
  500)
    die "${selected_route} returned 500 for invalid credentials"
    ;;
  *)
    die "expected 401 for invalid credentials, received ${negative_code}"
    ;;
esac
