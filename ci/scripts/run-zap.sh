#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

ZAP_IMAGE="${ZAP_IMAGE:-ghcr.io/zaproxy/zaproxy:stable}"
ZAP_TARGET_URL="${ZAP_TARGET_URL:-${GATEWAY_BASE_URL:-}}"
ZAP_FAIL_ON_WARN="${ZAP_FAIL_ON_WARN:-0}"
ZAP_MODE="${ZAP_MODE:-baseline}"

[ -n "${ZAP_TARGET_URL}" ] || die "ZAP_TARGET_URL or GATEWAY_BASE_URL is required"
require_command docker

mkdir -p "${REPORT_DIR}/zap"

docker pull "${ZAP_IMAGE}" > "${REPORT_DIR}/zap-pull.log" 2> "${REPORT_DIR}/zap-pull.err.log"

zap_script="zap-baseline.py"
if [ "${ZAP_MODE}" = "full" ]; then
  zap_script="zap-full-scan.py"
fi

zap_args=(-t "${ZAP_TARGET_URL}" -r zap.html -J zap.json -x zap.xml)
if [ "${ZAP_FAIL_ON_WARN}" = "0" ]; then
  zap_args+=(-I)
fi

set +e
docker run --rm \
  -v "${REPORT_DIR}/zap:/zap/wrk" \
  "${ZAP_IMAGE}" "${zap_script}" "${zap_args[@]}" \
  > "${REPORT_DIR}/zap.log" 2> "${REPORT_DIR}/zap.err.log"
rc=$?
set -e

case "${rc}" in
  0)
    log "PASS: OWASP ZAP DAST"
    ;;
  1|2)
    die "OWASP ZAP found release-blocking findings; see ${REPORT_DIR}/zap"
    ;;
  *)
    die "OWASP ZAP execution failed with exit code ${rc}; see ${REPORT_DIR}/zap.err.log"
    ;;
esac
