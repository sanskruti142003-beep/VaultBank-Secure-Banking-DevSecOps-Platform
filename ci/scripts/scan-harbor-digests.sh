#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" &&
  pwd
)"

# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-11-trivy-registry"

PUBLICATION_MANIFEST="${PUBLICATION_MANIFEST:-${ROOT_DIR}/reports/phase-10-harbor-publish/harbor-publication-manifest.json}"

SCAN_INPUT="${REPORT_DIR}/registry-scan-input.tsv"
SUMMARY_JSON="${REPORT_DIR}/trivy-registry-summary.json"
SUMMARY_TEXT="${REPORT_DIR}/trivy-registry-summary.txt"
CHECKSUM_FILE="${REPORT_DIR}/trivy-registry-checksums.sha256"
LOGIN_LOG="${REPORT_DIR}/trivy-registry-login.log"

require_command trivy
require_command python3
require_command sha256sum
require_command mktemp
require_command find
require_command sort
require_command xargs

[ -s "${PUBLICATION_MANIFEST}" ] ||
  die "Harbor publication manifest missing: ${PUBLICATION_MANIFEST}"

[ -n "${HARBOR_REGISTRY:-}" ] ||
  die "HARBOR_REGISTRY is required"

[ -n "${HARBOR_PROJECT:-}" ] ||
  die "HARBOR_PROJECT is required"

[ -n "${HARBOR_USERNAME:-}" ] ||
  die "HARBOR_USERNAME is required"

[ -n "${HARBOR_PASSWORD:-}" ] ||
  die "HARBOR_PASSWORD is required"

case "${HARBOR_REGISTRY}" in
  http://* | https://* | */*)
    die \
      "HARBOR_REGISTRY must be hostname:port without scheme or path"
    ;;
esac

SOURCE_COMMIT="$(full_commit)"

rm -rf "${REPORT_DIR}"
mkdir -p "${REPORT_DIR}"

python3 - \
  "${PUBLICATION_MANIFEST}" \
  "${SCAN_INPUT}" \
  "${HARBOR_REGISTRY}" \
  "${HARBOR_PROJECT}" \
  "${SOURCE_COMMIT}" \
  <<'PY'
import json
import re
import sys
from pathlib import Path

(
    manifest_path_value,
    output_path_value,
    registry,
    project,
    source_commit,
) = sys.argv[1:]

manifest_path = Path(manifest_path_value)
output_path = Path(output_path_value)

manifest = json.loads(
    manifest_path.read_text(encoding="utf-8")
)

expected_services = {
    "auth-service",
    "account-service",
    "transaction-service",
    "payment-service",
    "notification-service",
    "frontend",
}

if manifest.get("registry") != registry:
    raise SystemExit(
        "FAIL: publication registry does not match policy"
    )

if manifest.get("project") != project:
    raise SystemExit(
        "FAIL: publication project does not match policy"
    )

if manifest.get("source_commit") != source_commit:
    raise SystemExit(
        "FAIL: publication source commit does not match "
        "the current pipeline commit"
    )

if manifest.get("images_pushed") != 6:
    raise SystemExit(
        "FAIL: publication manifest does not report 6 images"
    )

if manifest.get("validation_passed") is not True:
    raise SystemExit(
        "FAIL: Harbor publication validation is not true"
    )

images = manifest.get("images") or []

if len(images) != 6:
    raise SystemExit(
        f"FAIL: expected 6 image entries, found {len(images)}"
    )

services = {
    image.get("service")
    for image in images
}

if services != expected_services:
    raise SystemExit(
        "FAIL: published service set does not match policy"
    )

reference_pattern = re.compile(
    rf"^{re.escape(registry)}/"
    rf"{re.escape(project)}/"
    r"[a-z0-9._-]+@sha256:[0-9a-f]{64}$"
)

lines = []
references = []

for image in sorted(
    images,
    key=lambda item: item["service"],
):
    service = image.get("service", "")
    reference = image.get("immutable_reference", "")

    if not reference_pattern.fullmatch(reference):
        raise SystemExit(
            f"FAIL: invalid digest reference for {service}: "
            f"{reference}"
        )

    if "\t" in reference or "\n" in reference:
        raise SystemExit(
            f"FAIL: unsafe image reference for {service}"
        )

    references.append(reference)
    lines.append(f"{service}\t{reference}")

if len(set(references)) != 6:
    raise SystemExit(
        "FAIL: Harbor digest references are not unique"
    )

output_path.write_text(
    "\n".join(lines) + "\n",
    encoding="utf-8",
)

print(
    "PASS: six unique Harbor digest references validated"
)
PY

SCAN_INPUT_COUNT="$(
  wc -l < "${SCAN_INPUT}" |
  tr -d '[:space:]'
)"

[ "${SCAN_INPUT_COUNT}" -eq 6 ] ||
  die \
    "Expected 6 Harbor scan inputs, found ${SCAN_INPUT_COUNT}"

DOCKER_CONFIG_DIR="$(
  mktemp -d /tmp/vaultbank-trivy-registry.XXXXXX
)"

chmod 700 "${DOCKER_CONFIG_DIR}"
export DOCKER_CONFIG="${DOCKER_CONFIG_DIR}"

cleanup() {
  rm -rf "${DOCKER_CONFIG_DIR}"
  unset HARBOR_PASSWORD
}

trap cleanup EXIT

log "Authenticating Trivy to Harbor"

set +x

printf '%s' "${HARBOR_PASSWORD}" |
trivy registry login \
  --username "${HARBOR_USERNAME}" \
  --password-stdin \
  "${HARBOR_REGISTRY}" \
  > "${LOGIN_LOG}" \
  2>&1

unset HARBOR_PASSWORD

log "PASS: Trivy Harbor authentication completed"

OVERALL_GATE_FAILURE=0

while IFS=$'\t' read -r service immutable_reference; do
  [ -n "${service}" ] ||
    die "Empty service in registry scan input"

  [ -n "${immutable_reference}" ] ||
    die "Empty digest reference for ${service}"

  REPORT_JSON="${REPORT_DIR}/trivy-${service}.json"
  SERVICE_SUMMARY="${REPORT_DIR}/trivy-${service}-summary.json"

  log "Scanning Harbor digest for ${service}"

  set +e

  trivy image \
    --quiet \
    --no-progress \
    --scanners vuln,secret,misconfig \
    --format json \
    --output "${REPORT_JSON}" \
    --timeout 20m \
    "${immutable_reference}"

  TRIVY_EXIT=$?

  set -e

  if [ "${TRIVY_EXIT}" -ne 0 ]; then
    die \
      "Trivy operational scan failed for ${service}; exit=${TRIVY_EXIT}"
  fi

  [ -s "${REPORT_JSON}" ] ||
    die "Trivy JSON report is empty for ${service}"

  COUNTS="$(
    python3 - \
      "${REPORT_JSON}" \
      "${SERVICE_SUMMARY}" \
      "${service}" \
      "${immutable_reference}" \
      <<'PY'
import json
import sys
from pathlib import Path

(
    report_path_value,
    summary_path_value,
    service,
    immutable_reference,
) = sys.argv[1:]

report_path = Path(report_path_value)
summary_path = Path(summary_path_value)

report = json.loads(
    report_path.read_text(encoding="utf-8")
)

results = report.get("Results") or []

vulnerabilities = []
secrets = []
misconfigurations = []

for result in results:
    vulnerabilities.extend(
        result.get("Vulnerabilities") or []
    )
    secrets.extend(
        result.get("Secrets") or []
    )
    misconfigurations.extend(
        result.get("Misconfigurations") or []
    )

critical_vulnerabilities = [
    finding
    for finding in vulnerabilities
    if str(finding.get("Severity", "")).upper()
    == "CRITICAL"
]

fixable_high_vulnerabilities = [
    finding
    for finding in vulnerabilities
    if (
        str(finding.get("Severity", "")).upper()
        == "HIGH"
        and str(
            finding.get("FixedVersion") or ""
        ).strip()
    )
]

summary = {
    "service": service,
    "immutable_reference": immutable_reference,
    "total_vulnerabilities": len(vulnerabilities),
    "critical_vulnerabilities": len(
        critical_vulnerabilities
    ),
    "fixable_high_vulnerabilities": len(
        fixable_high_vulnerabilities
    ),
    "secret_findings": len(secrets),
    "misconfiguration_findings": len(
        misconfigurations
    ),
}

summary["gate_passed"] = all(
    summary[field] == 0
    for field in (
        "critical_vulnerabilities",
        "fixable_high_vulnerabilities",
        "secret_findings",
        "misconfiguration_findings",
    )
)

summary_path.write_text(
    json.dumps(
        summary,
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)

print(
    "\t".join(
        str(summary[field])
        for field in (
            "critical_vulnerabilities",
            "fixable_high_vulnerabilities",
            "secret_findings",
            "misconfiguration_findings",
        )
    )
)
PY
  )"

  IFS=$'\t' read -r \
    CRITICAL_COUNT \
    FIXABLE_HIGH_COUNT \
    SECRET_COUNT \
    MISCONFIGURATION_COUNT \
    <<< "${COUNTS}"

  printf '%s\n' \
    "${service}: Critical=${CRITICAL_COUNT}, FixableHigh=${FIXABLE_HIGH_COUNT}, Secrets=${SECRET_COUNT}, Misconfigurations=${MISCONFIGURATION_COUNT}"

  if [ "${CRITICAL_COUNT}" -ne 0 ] ||
     [ "${FIXABLE_HIGH_COUNT}" -ne 0 ] ||
     [ "${SECRET_COUNT}" -ne 0 ] ||
     [ "${MISCONFIGURATION_COUNT}" -ne 0 ]; then

    OVERALL_GATE_FAILURE=1

    log \
      "FAIL: ${service} failed the Harbor digest security policy"
  else
    log \
      "PASS: ${service} passed the Harbor digest security policy"
  fi
done < "${SCAN_INPUT}"

export \
  REPORT_DIR \
  SUMMARY_JSON \
  SUMMARY_TEXT \
  HARBOR_REGISTRY \
  HARBOR_PROJECT \
  SOURCE_COMMIT

python3 - <<'PY'
import json
import os
from pathlib import Path

report_directory = Path(os.environ["REPORT_DIR"])

service_summaries = []

for path in sorted(
    report_directory.glob("trivy-*-summary.json")
):
    service_summaries.append(
        json.loads(
            path.read_text(encoding="utf-8")
        )
    )

if len(service_summaries) != 6:
    raise SystemExit(
        "FAIL: expected 6 Trivy service summaries, "
        f"found {len(service_summaries)}"
    )

services = {
    item["service"]
    for item in service_summaries
}

if len(services) != 6:
    raise SystemExit(
        "FAIL: duplicate services in Trivy summaries"
    )

summary = {
    "registry": os.environ["HARBOR_REGISTRY"],
    "project": os.environ["HARBOR_PROJECT"],
    "source_commit": os.environ["SOURCE_COMMIT"],
    "images_scanned": 6,
    "digest_references_scanned": 6,
    "critical_vulnerabilities": sum(
        item["critical_vulnerabilities"]
        for item in service_summaries
    ),
    "fixable_high_vulnerabilities": sum(
        item["fixable_high_vulnerabilities"]
        for item in service_summaries
    ),
    "secret_findings": sum(
        item["secret_findings"]
        for item in service_summaries
    ),
    "misconfiguration_findings": sum(
        item["misconfiguration_findings"]
        for item in service_summaries
    ),
    "images": service_summaries,
}

summary["validation_passed"] = all(
    (
        summary["critical_vulnerabilities"] == 0,
        summary["fixable_high_vulnerabilities"] == 0,
        summary["secret_findings"] == 0,
        summary["misconfiguration_findings"] == 0,
    )
)

Path(os.environ["SUMMARY_JSON"]).write_text(
    json.dumps(
        summary,
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)

lines = [
    f"Registry: {summary['registry']}",
    f"Project: {summary['project']}",
    f"Source commit: {summary['source_commit']}",
    "Images scanned: 6",
    "Digest references scanned: 6",
    (
        "Critical vulnerabilities: "
        f"{summary['critical_vulnerabilities']}"
    ),
    (
        "Fixable High vulnerabilities: "
        f"{summary['fixable_high_vulnerabilities']}"
    ),
    (
        "Secret findings: "
        f"{summary['secret_findings']}"
    ),
    (
        "Misconfiguration findings: "
        f"{summary['misconfiguration_findings']}"
    ),
    (
        "Validation passed: "
        + str(summary["validation_passed"]).lower()
    ),
]

Path(os.environ["SUMMARY_TEXT"]).write_text(
    "\n".join(lines) + "\n",
    encoding="utf-8",
)

print("\n".join(lines))
PY

CHECKSUM_TMP="$(
  mktemp /tmp/vaultbank-trivy-checksums.XXXXXX
)"

cleanup_checksum_tmp() {
  rm -f "${CHECKSUM_TMP}"
}

trap cleanup_checksum_tmp EXIT

(
  cd "${REPORT_DIR}"

  find . \
    -maxdepth 1 \
    -type f \
    ! -name "$(basename "${CHECKSUM_FILE}")" \
    -print0 |
  sort -z |
  xargs -0 sha256sum
) > "${CHECKSUM_TMP}"

mv "${CHECKSUM_TMP}" "${CHECKSUM_FILE}"

trap - EXIT

find "${REPORT_DIR}" \
  -type f \
  -exec chmod 640 {} +

if [ "${OVERALL_GATE_FAILURE}" -ne 0 ]; then
  die \
    "One or more Harbor digest scans failed security policy"
fi

VALIDATION_PASSED="$(
  python3 - \
    "${SUMMARY_JSON}" \
    <<'PY'
import json
import sys
from pathlib import Path

summary = json.loads(
    Path(sys.argv[1]).read_text(
        encoding="utf-8"
    )
)

print(
    "true"
    if summary.get("validation_passed") is True
    else "false"
)
PY
)"

[ "${VALIDATION_PASSED}" = "true" ] ||
  die "Trivy registry summary validation failed"

log "PASS: six Harbor image digests passed Trivy security policy"
