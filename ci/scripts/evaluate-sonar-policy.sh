#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-04-sonarcloud"

POLICY_FILE="${ROOT_DIR}/config/pipeline-policy.yml"
PROJECT_PROPERTIES="${ROOT_DIR}/sonar-project.properties"
REPORT_TASK_FILE="${ROOT_DIR}/.scannerwork/report-task.txt"

SONAR_TOKEN="${SONAR_TOKEN:-}"
SONAR_HOST_URL="${SONAR_HOST_URL:-https://sonarcloud.io}"
SONAR_HOST_URL="${SONAR_HOST_URL%/}"
SONAR_CE_TIMEOUT="${SONAR_CE_TIMEOUT:-300}"
SONAR_CE_POLL_SECONDS="${SONAR_CE_POLL_SECONDS:-5}"
SONAR_NEW_CODE_COVERAGE_MINIMUM="${SONAR_NEW_CODE_COVERAGE_MINIMUM:-}"

[ -n "${SONAR_TOKEN}" ] ||
  die "SONAR_TOKEN is required to evaluate the Sonar policy"

[ -f "${POLICY_FILE}" ] ||
  die "Missing pipeline policy: ${POLICY_FILE}"

[ -f "${PROJECT_PROPERTIES}" ] ||
  die "Missing sonar-project.properties"

[ -f "${REPORT_TASK_FILE}" ] ||
  die "Missing Sonar report task file: ${REPORT_TASK_FILE}"

if [ -z "${SONAR_NEW_CODE_COVERAGE_MINIMUM}" ]; then
  SONAR_NEW_CODE_COVERAGE_MINIMUM="$(
    awk -F: \
      '/^[[:space:]]*sonar_new_code_coverage_minimum:/ {
        gsub(/[[:space:]]/, "", $2)
        print $2
        exit
      }' \
      "${POLICY_FILE}"
  )"
fi

[ -n "${SONAR_NEW_CODE_COVERAGE_MINIMUM}" ] ||
  die "sonar_new_code_coverage_minimum is missing from ${POLICY_FILE}"

case "${SONAR_NEW_CODE_COVERAGE_MINIMUM}" in
  *[!0-9.]*)
    die "sonar_new_code_coverage_minimum must be numeric"
    ;;
esac

case "${SONAR_CE_TIMEOUT}" in
  *[!0-9]* | "")
    die "SONAR_CE_TIMEOUT must be a positive integer"
    ;;
esac

case "${SONAR_CE_POLL_SECONDS}" in
  *[!0-9]* | "")
    die "SONAR_CE_POLL_SECONDS must be a positive integer"
    ;;
esac

require_command awk
require_command curl
require_command mktemp
require_command node

project_key="$(
  awk -F= \
    '$1 == "sonar.projectKey" {
      print substr($0, index($0, "=") + 1)
      exit
    }' \
    "${PROJECT_PROPERTIES}"
)"

ce_task_id="$(
  awk -F= \
    '$1 == "ceTaskId" {
      print substr($0, index($0, "=") + 1)
      exit
    }' \
    "${REPORT_TASK_FILE}"
)"

[ -n "${project_key}" ] ||
  die "sonar.projectKey is missing"

[ -n "${ce_task_id}" ] ||
  die "ceTaskId is missing from ${REPORT_TASK_FILE}"

SONAR_CURL_CONFIG=""

cleanup() {
  if [ -n "${SONAR_CURL_CONFIG}" ]; then
    rm -f "${SONAR_CURL_CONFIG}"
  fi

  unset SONAR_TOKEN
}

trap cleanup EXIT

SONAR_CURL_CONFIG="$(
  mktemp /tmp/vaultbank-sonar-policy-curl.XXXXXX
)"

chmod 600 "${SONAR_CURL_CONFIG}"

printf 'user = "%s:"\n' "${SONAR_TOKEN}" \
  > "${SONAR_CURL_CONFIG}"

sonar_get() {
  local endpoint="$1"
  local output_file="$2"
  shift 2

  curl \
    --fail \
    --silent \
    --show-error \
    --config "${SONAR_CURL_CONFIG}" \
    --get "${SONAR_HOST_URL}/api/${endpoint}" \
    "$@" \
    --output "${output_file}"
}

ce_task_file="${REPORT_DIR}/sonar-ce-task.json"
quality_gate_file="${REPORT_DIR}/sonar-quality-gate-status.json"
effective_policy_json="${REPORT_DIR}/sonar-effective-policy.json"
effective_policy_text="${REPORT_DIR}/sonar-effective-policy.txt"

deadline=$((SECONDS + SONAR_CE_TIMEOUT))

log "Waiting for Sonar Compute Engine task ${ce_task_id}"

while true; do
  sonar_get \
    "ce/task" \
    "${ce_task_file}" \
    --data-urlencode "id=${ce_task_id}" ||
    die "Unable to read Sonar Compute Engine task ${ce_task_id}"

  ce_status="$(
    node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(String(data.task?.status || ""));
' \
      "${ce_task_file}"
  )"

  case "${ce_status}" in
    SUCCESS)
      break
      ;;
    FAILED | CANCELED)
      die "Sonar Compute Engine task ended with status ${ce_status}"
      ;;
    PENDING | IN_PROGRESS | "")
      if [ "${SECONDS}" -ge "${deadline}" ]; then
        die "Timed out waiting for Sonar Compute Engine task ${ce_task_id}"
      fi

      log "Sonar Compute Engine task status: ${ce_status:-unknown}"
      sleep "${SONAR_CE_POLL_SECONDS}"
      ;;
    *)
      die "Unexpected Sonar Compute Engine task status: ${ce_status}"
      ;;
  esac
done

log "Reading Sonar quality gate status for ${project_key}"

sonar_get \
  "qualitygates/project_status" \
  "${quality_gate_file}" \
  --data-urlencode "projectKey=${project_key}" ||
  die "Unable to read Sonar quality gate status for ${project_key}"

node - \
  "${quality_gate_file}" \
  "${effective_policy_json}" \
  "${effective_policy_text}" \
  "${SONAR_NEW_CODE_COVERAGE_MINIMUM}" <<'JS'
const fs = require("fs");

const [
  qualityGatePath,
  outputJsonPath,
  outputTextPath,
  minimumCoverageText,
] = process.argv.slice(2);

const minimumCoverage = Number(minimumCoverageText);

if (!Number.isFinite(minimumCoverage)) {
  throw new Error("Invalid Sonar coverage minimum");
}

const document = JSON.parse(
  fs.readFileSync(qualityGatePath, "utf8"),
);

const projectStatus = document.projectStatus || {};
const conditions = projectStatus.conditions || [];
const failingConditions = conditions.filter(
  (condition) => condition.status && condition.status !== "OK",
);

const blockingConditions = [];
const acceptedCoverageConditions = [];

for (const condition of failingConditions) {
  const metric = String(condition.metricKey || "");
  const actualValue = Number(condition.actualValue);

  if (
    metric === "new_coverage" &&
    Number.isFinite(actualValue) &&
    actualValue >= minimumCoverage
  ) {
    acceptedCoverageConditions.push(condition);
    continue;
  }

  blockingConditions.push(condition);
}

if (
  projectStatus.status &&
  projectStatus.status !== "OK" &&
  failingConditions.length === 0
) {
  blockingConditions.push({
    metricKey: "quality_gate_status",
    status: projectStatus.status,
    actualValue: projectStatus.status,
    errorThreshold: "OK",
  });
}

const effectiveStatus = blockingConditions.length === 0 ? "OK" : "ERROR";

const result = {
  server_status: projectStatus.status || "UNKNOWN",
  effective_status: effectiveStatus,
  new_code_coverage_minimum: minimumCoverage,
  accepted_coverage_conditions: acceptedCoverageConditions,
  blocking_conditions: blockingConditions,
  conditions,
};

fs.writeFileSync(
  outputJsonPath,
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8",
);

const lines = [
  `Sonar server status: ${result.server_status}`,
  `Effective policy status: ${result.effective_status}`,
  `New-code coverage minimum: ${minimumCoverage}%`,
  `Accepted coverage-only conditions: ${acceptedCoverageConditions.length}`,
  `Blocking conditions: ${blockingConditions.length}`,
];

for (const condition of blockingConditions) {
  lines.push(
    `BLOCKING ${condition.metricKey}: status=${condition.status} actual=${condition.actualValue ?? ""} threshold=${condition.errorThreshold ?? ""}`,
  );
}

fs.writeFileSync(
  outputTextPath,
  `${lines.join("\n")}\n`,
  "utf8",
);

console.log(lines.join("\n"));

if (effectiveStatus !== "OK") {
  process.exit(1);
}
JS

log "PASS: Sonar effective quality policy passed"
