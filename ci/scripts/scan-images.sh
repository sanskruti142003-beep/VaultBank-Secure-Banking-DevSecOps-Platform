#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-08-trivy-image"

VERSIONS_FILE="${ROOT_DIR}/config/tool-versions.env"
POLICY_FILE="${ROOT_DIR}/config/pipeline-policy.yml"
TRIVY_IGNORE_FILE="${ROOT_DIR}/.trivyignore.yaml"

IMAGE_LIST="${IMAGE_LIST:-${ROOT_DIR}/reports/phase-07-build/images.txt}"
TRIVY_CACHE_DIR="${TRIVY_CACHE_DIR:-/var/lib/jenkins/trivy-cache}"

JSON_DIR="${REPORT_DIR}/json"
TABLE_DIR="${REPORT_DIR}/table"
SARIF_DIR="${REPORT_DIR}/sarif"

SUMMARY_JSON="${REPORT_DIR}/trivy-image-summary.json"
SUMMARY_TEXT="${REPORT_DIR}/trivy-image-summary.txt"
METADATA_FILE="${REPORT_DIR}/trivy-image-metadata.txt"

require_command docker
require_command trivy
require_command python3
require_command awk
require_command grep

[ -f "${VERSIONS_FILE}" ] ||
  die "Missing tool-version policy: ${VERSIONS_FILE}"

[ -f "${POLICY_FILE}" ] ||
  die "Missing pipeline policy: ${POLICY_FILE}"

[ -f "${TRIVY_IGNORE_FILE}" ] ||
  die "Missing Trivy exception policy: ${TRIVY_IGNORE_FILE}"

[ -s "${IMAGE_LIST}" ] ||
  die "Image list not found: ${IMAGE_LIST}; run build-images.sh first"

[ -d "${TRIVY_CACHE_DIR}" ] ||
  die "Trivy cache directory does not exist: ${TRIVY_CACHE_DIR}"

[ -w "${TRIVY_CACHE_DIR}" ] ||
  die "Trivy cache directory is not writable: ${TRIVY_CACHE_DIR}"

# shellcheck disable=SC1090
source "${VERSIONS_FILE}"

TRIVY_VERSION="${TRIVY_VERSION:-}"

[ -n "${TRIVY_VERSION}" ] ||
  die "TRIVY_VERSION is missing from ${VERSIONS_FILE}"

INSTALLED_TRIVY_VERSION="$(
  trivy --version |
    awk '
      $1 == "Version:" {
        print $2
        exit
      }
    '
)"

[ -n "${INSTALLED_TRIVY_VERSION}" ] ||
  die "Unable to determine installed Trivy version"

if [ "${INSTALLED_TRIVY_VERSION}" != "${TRIVY_VERSION}" ]; then
  die \
    "Installed Trivy ${INSTALLED_TRIVY_VERSION} does not match policy ${TRIVY_VERSION}"
fi

declare -a REQUIRED_ZERO_POLICIES=(
  "trivy_critical_vulnerabilities"
  "trivy_fixable_high_vulnerabilities"
  "trivy_high_or_critical_secrets"
  "trivy_high_or_critical_misconfigurations"
)

for policy_name in "${REQUIRED_ZERO_POLICIES[@]}"; do
  policy_value="$(
    awk \
      -v policy_name="${policy_name}" \
      '
        $1 == policy_name ":" {
          print $2
          exit
        }
      ' \
      "${POLICY_FILE}"
  )"

  [ -n "${policy_value}" ] ||
    die "Missing pipeline policy: ${policy_name}"

  if [ "${policy_value}" != "0" ]; then
    die \
      "Phase 4B policy ${policy_name} must remain 0, found ${policy_value}"
  fi
done

mapfile -t IMAGES < <(
  grep -v '^[[:space:]]*$' "${IMAGE_LIST}"
)

if [ "${#IMAGES[@]}" -ne 6 ]; then
  die \
    "Expected exactly 6 images, found ${#IMAGES[@]}"
fi

UNIQUE_IMAGE_COUNT="$(
  printf '%s\n' "${IMAGES[@]}" |
    sort -u |
    wc -l |
    tr -d '[:space:]'
)"

if [ "${UNIQUE_IMAGE_COUNT}" -ne 6 ]; then
  die "Image list contains duplicate references"
fi

for image in "${IMAGES[@]}"; do
  case "${image}" in
    *:latest)
      die "latest image tag is prohibited: ${image}"
      ;;
  esac

  docker image inspect "${image}" >/dev/null 2>&1 ||
    die "Local Docker image does not exist: ${image}"
done

python3 \
  "${SCRIPT_DIR}/validate-security-exceptions.py"

rm -rf \
  "${JSON_DIR}" \
  "${TABLE_DIR}" \
  "${SARIF_DIR}"

mkdir -p \
  "${JSON_DIR}" \
  "${TABLE_DIR}" \
  "${SARIF_DIR}"

rm -f \
  "${SUMMARY_JSON}" \
  "${SUMMARY_TEXT}" \
  "${METADATA_FILE}"

declare -a TRIVY_COMMON_ARGS=(
  --cache-dir "${TRIVY_CACHE_DIR}"
  --image-src docker
  --ignorefile "${TRIVY_IGNORE_FILE}"
  --no-progress
  --timeout 15m
  --skip-version-check
)

log "Starting Trivy scan of six local Docker images"

for image in "${IMAGES[@]}"; do
  name="$(safe_name "${image}")"

  log "Scanning ${image}"

  run_logged \
    "trivy-image-json-${name}" \
    trivy image \
    "${TRIVY_COMMON_ARGS[@]}" \
    --scanners vuln \
    --image-config-scanners misconfig,secret \
    --exit-code 0 \
    --format json \
    --output "${JSON_DIR}/${name}.json" \
    "${image}"

  [ -s "${JSON_DIR}/${name}.json" ] ||
    die "JSON report was not generated for ${image}"

  run_logged \
    "trivy-image-table-${name}" \
    trivy image \
    "${TRIVY_COMMON_ARGS[@]}" \
    --scanners vuln \
    --image-config-scanners misconfig,secret \
    --severity HIGH,CRITICAL \
    --exit-code 0 \
    --format table \
    --output "${TABLE_DIR}/${name}.txt" \
    "${image}"

  [ -s "${TABLE_DIR}/${name}.txt" ] ||
    die "Table report was not generated for ${image}"

  run_logged \
    "trivy-image-sarif-${name}" \
    trivy image \
    "${TRIVY_COMMON_ARGS[@]}" \
    --scanners vuln \
    --image-config-scanners misconfig,secret \
    --severity HIGH,CRITICAL \
    --exit-code 0 \
    --format sarif \
    --output "${SARIF_DIR}/${name}.sarif" \
    "${image}"

  [ -s "${SARIF_DIR}/${name}.sarif" ] ||
    die "SARIF report was not generated for ${image}"
done

export JSON_DIR SUMMARY_JSON SUMMARY_TEXT

set +e

python3 - <<'PY'
import json
import os
from pathlib import Path

json_dir = Path(os.environ["JSON_DIR"])
summary_json = Path(os.environ["SUMMARY_JSON"])
summary_text = Path(os.environ["SUMMARY_TEXT"])

rows = []

for report_path in sorted(json_dir.glob("*.json")):
    report = json.loads(
        report_path.read_text(encoding="utf-8")
    )

    image_name = (
        report.get("ArtifactName")
        or report_path.stem
    )

    critical_vulnerabilities = 0
    fixable_high_vulnerabilities = 0
    high_critical_secrets = 0
    high_critical_misconfigurations = 0

    for result in report.get("Results", []):
        for finding in result.get("Vulnerabilities") or []:
            severity = str(
                finding.get("Severity", "")
            ).upper()

            fixed_version = str(
                finding.get("FixedVersion") or ""
            ).strip()

            if severity == "CRITICAL":
                critical_vulnerabilities += 1

            if severity == "HIGH" and fixed_version:
                fixable_high_vulnerabilities += 1

        for finding in result.get("Secrets") or []:
            severity = str(
                finding.get("Severity", "")
            ).upper()

            if severity in {"HIGH", "CRITICAL"}:
                high_critical_secrets += 1

        for finding in result.get("Misconfigurations") or []:
            severity = str(
                finding.get("Severity", "")
            ).upper()

            if severity in {"HIGH", "CRITICAL"}:
                high_critical_misconfigurations += 1

    rows.append(
        {
            "image": image_name,
            "critical_vulnerabilities":
                critical_vulnerabilities,
            "fixable_high_vulnerabilities":
                fixable_high_vulnerabilities,
            "high_or_critical_secrets":
                high_critical_secrets,
            "high_or_critical_misconfigurations":
                high_critical_misconfigurations,
        }
    )

if len(rows) != 6:
    raise SystemExit(
        f"Expected 6 image reports, found {len(rows)}"
    )

totals = {
    "critical_vulnerabilities": sum(
        row["critical_vulnerabilities"]
        for row in rows
    ),
    "fixable_high_vulnerabilities": sum(
        row["fixable_high_vulnerabilities"]
        for row in rows
    ),
    "high_or_critical_secrets": sum(
        row["high_or_critical_secrets"]
        for row in rows
    ),
    "high_or_critical_misconfigurations": sum(
        row["high_or_critical_misconfigurations"]
        for row in rows
    ),
}

gate_passed = all(
    value == 0
    for value in totals.values()
)

summary = {
    "images_scanned": len(rows),
    "totals": totals,
    "gate_passed": gate_passed,
    "images": rows,
}

summary_json.write_text(
    json.dumps(summary, indent=2) + "\n",
    encoding="utf-8",
)

lines = [
    f"Images scanned: {len(rows)}",
    "",
]

for row in rows:
    lines.append(
        f"{row['image']}: "
        f"critical={row['critical_vulnerabilities']} "
        f"fixable_high={row['fixable_high_vulnerabilities']} "
        f"secrets={row['high_or_critical_secrets']} "
        f"misconfigurations="
        f"{row['high_or_critical_misconfigurations']}"
    )

lines.extend(
    [
        "",
        (
            "Total Critical vulnerabilities: "
            f"{totals['critical_vulnerabilities']}"
        ),
        (
            "Total fixable High vulnerabilities: "
            f"{totals['fixable_high_vulnerabilities']}"
        ),
        (
            "Total High/Critical secrets: "
            f"{totals['high_or_critical_secrets']}"
        ),
        (
            "Total High/Critical misconfigurations: "
            f"{totals['high_or_critical_misconfigurations']}"
        ),
        f"Gate passed: {str(gate_passed).lower()}",
    ]
)

summary_text.write_text(
    "\n".join(lines) + "\n",
    encoding="utf-8",
)

print("\n".join(lines))

if not gate_passed:
    raise SystemExit(1)
PY

GATE_EXIT=$?

set -e

printf '%s\n' \
  "trivy_version=${INSTALLED_TRIVY_VERSION}" \
  "images_scanned=6" \
  "image_source=docker" \
  "git_commit=$(git -C "${ROOT_DIR}" rev-parse HEAD)" \
  "git_branch=$(git -C "${ROOT_DIR}" branch --show-current)" \
  "critical_vulnerabilities_allowed=0" \
  "fixable_high_vulnerabilities_allowed=0" \
  "high_or_critical_secrets_allowed=0" \
  "high_or_critical_misconfigurations_allowed=0" \
  > "${METADATA_FILE}"

find "${REPORT_DIR}" \
  -type f \
  -exec chmod 640 {} +

if [ "${GATE_EXIT}" -ne 0 ]; then
  die \
    "Trivy image gate failed; inspect ${SUMMARY_TEXT} and ${TABLE_DIR}"
fi

log "PASS: six Trivy container image security gates"
