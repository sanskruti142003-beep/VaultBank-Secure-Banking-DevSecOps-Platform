#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-04-sonarcloud"

POLICY_FILE="${ROOT_DIR}/config/pipeline-policy.yml"
PROJECT_PROPERTIES="${ROOT_DIR}/sonar-project.properties"

SONAR_TOKEN="${SONAR_TOKEN:-}"
SONAR_HOST_URL="${SONAR_HOST_URL:-https://sonarcloud.io}"
SONAR_HOST_URL="${SONAR_HOST_URL%/}"
SONAR_GATE_NAME="${SONAR_GATE_NAME:-Vault Bank POC Quality Gate}"
SONAR_NEW_CODE_COVERAGE_MINIMUM="${SONAR_NEW_CODE_COVERAGE_MINIMUM:-}"

[ -n "${SONAR_TOKEN}" ] ||
  die "SONAR_TOKEN is required to configure the Sonar quality gate"

[ -f "${POLICY_FILE}" ] ||
  die "Missing pipeline policy: ${POLICY_FILE}"

[ -f "${PROJECT_PROPERTIES}" ] ||
  die "Missing sonar-project.properties"

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

require_command awk
require_command curl
require_command node

project_key="$(
  awk -F= \
    '$1 == "sonar.projectKey" {
      print substr($0, index($0, "=") + 1)
      exit
    }' \
    "${PROJECT_PROPERTIES}"
)"

organization_key="$(
  awk -F= \
    '$1 == "sonar.organization" {
      print substr($0, index($0, "=") + 1)
      exit
    }' \
    "${PROJECT_PROPERTIES}"
)"

[ -n "${project_key}" ] ||
  die "sonar.projectKey is missing"

[ -n "${organization_key}" ] ||
  die "sonar.organization is missing"

declare -a organization_args=()
if [ -n "${organization_key}" ]; then
  organization_args+=(--data-urlencode "organization=${organization_key}")
fi

sonar_get() {
  local endpoint="$1"
  local output_file="$2"
  shift 2

  curl \
    --fail \
    --silent \
    --show-error \
    --user "${SONAR_TOKEN}:" \
    --get "${SONAR_HOST_URL}/api/${endpoint}" \
    "$@" \
    --output "${output_file}"
}

sonar_post() {
  local endpoint="$1"
  local output_file="$2"
  shift 2

  curl \
    --fail \
    --silent \
    --show-error \
    --user "${SONAR_TOKEN}:" \
    --request POST \
    "${SONAR_HOST_URL}/api/${endpoint}" \
    "$@" \
    --output "${output_file}"
}

show_response="${REPORT_DIR}/sonar-quality-gate-show.json"
create_response="${REPORT_DIR}/sonar-quality-gate-create.json"
condition_response="${REPORT_DIR}/sonar-quality-gate-condition.json"
select_response="${REPORT_DIR}/sonar-quality-gate-select.json"
verify_response="${REPORT_DIR}/sonar-quality-gate-verify.json"

log "Syncing Sonar quality gate '${SONAR_GATE_NAME}'"

if ! sonar_get \
  "qualitygates/show" \
  "${show_response}" \
  --data-urlencode "name=${SONAR_GATE_NAME}" \
  "${organization_args[@]}"; then
  log "Sonar quality gate not found; creating '${SONAR_GATE_NAME}'"
  sonar_post \
    "qualitygates/create" \
    "${create_response}" \
    --data-urlencode "name=${SONAR_GATE_NAME}" \
    "${organization_args[@]}" ||
    die "Unable to create Sonar quality gate '${SONAR_GATE_NAME}'. Give the Jenkins Sonar token Administer Quality Gates permission, or create the gate manually in SonarCloud."

  sonar_get \
    "qualitygates/show" \
    "${show_response}" \
    --data-urlencode "name=${SONAR_GATE_NAME}" \
    "${organization_args[@]}" ||
    die "Unable to read Sonar quality gate '${SONAR_GATE_NAME}' after creation"
fi

gate_id="$(
  node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const id = data.id ?? data.qualityGate?.id ?? "";
process.stdout.write(String(id));
' \
    "${show_response}"
)"

[ -n "${gate_id}" ] ||
  die "Unable to determine Sonar quality gate id for '${SONAR_GATE_NAME}'"

condition_id="$(
  node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const conditions = data.conditions ?? data.qualityGate?.conditions ?? [];
const condition = conditions.find((item) => item.metric === "new_coverage");
process.stdout.write(condition?.id ? String(condition.id) : "");
' \
    "${show_response}"
)"

if [ -n "${condition_id}" ]; then
  log \
    "Updating Sonar new-code coverage condition to ${SONAR_NEW_CODE_COVERAGE_MINIMUM}%"
  sonar_post \
    "qualitygates/update_condition" \
    "${condition_response}" \
    --data-urlencode "id=${condition_id}" \
    --data-urlencode "metric=new_coverage" \
    --data-urlencode "op=LT" \
    --data-urlencode "error=${SONAR_NEW_CODE_COVERAGE_MINIMUM}" \
    "${organization_args[@]}" ||
    die "Unable to update Sonar new-code coverage condition"
else
  log \
    "Creating Sonar new-code coverage condition at ${SONAR_NEW_CODE_COVERAGE_MINIMUM}%"
  sonar_post \
    "qualitygates/create_condition" \
    "${condition_response}" \
    --data-urlencode "gateId=${gate_id}" \
    --data-urlencode "metric=new_coverage" \
    --data-urlencode "op=LT" \
    --data-urlencode "error=${SONAR_NEW_CODE_COVERAGE_MINIMUM}" \
    "${organization_args[@]}" ||
    die "Unable to create Sonar new-code coverage condition"
fi

sonar_post \
  "qualitygates/select" \
  "${select_response}" \
  --data-urlencode "gateId=${gate_id}" \
  --data-urlencode "projectKey=${project_key}" \
  "${organization_args[@]}" ||
  die "Unable to attach Sonar quality gate '${SONAR_GATE_NAME}' to ${project_key}"

sonar_get \
  "qualitygates/get_by_project" \
  "${verify_response}" \
  --data-urlencode "project=${project_key}" \
  "${organization_args[@]}" ||
  die "Unable to verify Sonar quality gate selection for ${project_key}"

{
  printf 'gateName=%s\n' "${SONAR_GATE_NAME}"
  printf 'gateId=%s\n' "${gate_id}"
  printf 'projectKey=%s\n' "${project_key}"
  printf 'organization=%s\n' "${organization_key}"
  printf 'newCodeCoverageMinimum=%s\n' \
    "${SONAR_NEW_CODE_COVERAGE_MINIMUM}"
} > "${REPORT_DIR}/sonar-quality-gate-policy.txt"

log \
  "PASS: Sonar quality gate '${SONAR_GATE_NAME}' enforces ${SONAR_NEW_CODE_COVERAGE_MINIMUM}% new-code coverage"
