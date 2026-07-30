#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

DEFECTDOJO_URL="${DEFECTDOJO_URL:-}"
DEFECTDOJO_TOKEN="${DEFECTDOJO_TOKEN:-}"
DEFECTDOJO_PRODUCT_NAME="${DEFECTDOJO_PRODUCT_NAME:-VaultBank}"
DEFECTDOJO_ENGAGEMENT_NAME="${DEFECTDOJO_ENGAGEMENT_NAME:-${JOB_NAME:-DevSecOps}-${BUILD_NUMBER:-local}}"

[ -n "${DEFECTDOJO_URL}" ] || die "DEFECTDOJO_URL is required"
[ -n "${DEFECTDOJO_TOKEN}" ] || die "DEFECTDOJO_TOKEN is required"
require_command curl

import_report() {
  local scan_type="$1"
  local file="$2"

  [ -f "${file}" ] || return 0
  log "importing ${scan_type}: ${file}"
  curl --fail --silent --show-error \
    -H "Authorization: Token ${DEFECTDOJO_TOKEN}" \
    -F "scan_type=${scan_type}" \
    -F "product_name=${DEFECTDOJO_PRODUCT_NAME}" \
    -F "engagement_name=${DEFECTDOJO_ENGAGEMENT_NAME}" \
    -F "auto_create_context=true" \
    -F "close_old_findings=false" \
    -F "minimum_severity=Info" \
    -F "file=@${file}" \
    "${DEFECTDOJO_URL%/}/api/v2/import-scan/" \
    > "${REPORT_DIR}/defectdojo-$(basename "${file}").json"
}

import_report "Trivy Scan" "${REPORT_DIR}/trivy-fs.sarif"
import_report "Dependency Check Scan" "${REPORT_DIR}/dependency-check/dependency-check-report.json"
import_report "ZAP Scan" "${REPORT_DIR}/zap/zap.xml"

find "${REPORT_DIR}/image-scans" -type f -name '*.sarif' 2>/dev/null | while read -r report; do
  import_report "Trivy Scan" "${report}"
done

log "PASS: DefectDojo vulnerability import"
