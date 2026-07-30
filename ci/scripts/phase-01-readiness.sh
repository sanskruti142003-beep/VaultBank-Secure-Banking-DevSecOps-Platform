#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TOOL_VERSIONS_FILE="${ROOT_DIR}/config/tool-versions.env"

if [ -f "${TOOL_VERSIONS_FILE}" ]; then
  # shellcheck disable=SC1090
  source "${TOOL_VERSIONS_FILE}"
fi

TRUFFLEHOG_IMAGE="${TRUFFLEHOG_IMAGE:-trufflesecurity/trufflehog:3.96.0}"
REPORT_ROOT="${ROOT_DIR}/reports/phase-01"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="${REPORT_ROOT}/${RUN_ID}"
BACKUP_ROOT="${PHASE01_BACKUP_ROOT:-${REPORT_ROOT}/protected-backups}"
BACKUP_DIR="${BACKUP_ROOT}/${RUN_ID}"

failures=0
warnings=0

mkdir -p "${REPORT_DIR}" "${BACKUP_DIR}"
chmod 700 "${REPORT_DIR}" "${BACKUP_DIR}" 2>/dev/null || true

pass() {
  printf 'PASS: %s\n' "$1" | tee -a "${REPORT_DIR}/summary.log"
}

warn() {
  printf 'WARN: %s\n' "$1" | tee -a "${REPORT_DIR}/summary.log" >&2
  warnings=$((warnings + 1))
}

fail() {
  printf 'FAIL: %s\n' "$1" | tee -a "${REPORT_DIR}/summary.log" >&2
  failures=$((failures + 1))
}

note() {
  printf 'NOTE: %s\n' "$1" >> "${REPORT_DIR}/summary.log"
}

have_command() {
  command -v "$1" >/dev/null 2>&1
}

require_command() {
  local command_name="$1"

  if ! have_command "${command_name}"; then
    fail "missing required command: ${command_name}"
    return 1
  fi
}

run_required() {
  local log_name="$1"
  local failure_label="$2"
  shift 2

  if "$@" > >(tee "${REPORT_DIR}/${log_name}.log" >/dev/null) \
    2> >(tee "${REPORT_DIR}/${log_name}.err.log" >&2); then
    return 0
  fi

  fail "${failure_label}"
  return 1
}

run_substep() {
  local log_name="$1"
  shift

  "$@" > >(tee "${REPORT_DIR}/${log_name}.log" >/dev/null) \
    2> >(tee "${REPORT_DIR}/${log_name}.err.log" >&2)
}

run_check() {
  local label="$1"
  local log_name="$2"
  shift 2

  if "$@" > >(tee "${REPORT_DIR}/${log_name}.log" >/dev/null) \
    2> >(tee "${REPORT_DIR}/${log_name}.err.log" >&2); then
    pass "${label}"
    return 0
  fi

  fail "${label}"
  return 1
}

write_environment_report() {
  {
    printf 'timestamp_utc=%s\n' "$(date -u +%FT%TZ)"
    printf 'root_dir=%s\n' "${ROOT_DIR}"
    printf 'git_commit=%s\n' "$(git rev-parse HEAD 2>/dev/null || true)"
    printf 'git_branch=%s\n' "$(git branch --show-current 2>/dev/null || true)"
    printf 'node_version=%s\n' "$(node --version 2>/dev/null || true)"
    printf 'npm_version=%s\n' "$(npm --version 2>/dev/null || true)"
    printf 'docker_version=%s\n' "$(docker --version 2>/dev/null || true)"
    printf 'compose_version=%s\n' "$(docker compose version 2>/dev/null || true)"
    printf 'curl_version=%s\n' "$(curl --version 2>/dev/null | head -n 1 || true)"
  } > "${REPORT_DIR}/environment.txt"

  git status --short > "${REPORT_DIR}/git-status.txt" 2>/dev/null || true
}

check_working_tree() {
  local status

  status="$(git status --porcelain --untracked-files=normal)"

  if [ -n "${status}" ]; then
    printf '%s\n' "${status}" \
      > "${REPORT_DIR}/git-status-dirty.txt"

    warn \
      "working tree is not clean; review ${REPORT_DIR}/git-status-dirty.txt"

    return 0
  fi

  pass "working tree is clean"
}

check_snapshot_and_backup() {
  local ok=1

  git rev-parse HEAD > "${REPORT_DIR}/git-head.txt" 2>&1 || ok=0
  git status --short > "${REPORT_DIR}/git-status.txt" 2>&1 || ok=0
  git diff --binary > "${BACKUP_DIR}/working-tree.diff" 2> "${REPORT_DIR}/working-tree-diff.err.log" || ok=0
  git diff --cached --binary > "${BACKUP_DIR}/staged-tree.diff" 2> "${REPORT_DIR}/staged-tree-diff.err.log" || ok=0
  git bundle create "${BACKUP_DIR}/repository-history.bundle" --all \
    > "${REPORT_DIR}/git-bundle.log" 2> "${REPORT_DIR}/git-bundle.err.log" || ok=0

  {
    printf 'run_id=%s\n' "${RUN_ID}"
    printf 'created_utc=%s\n' "$(date -u +%FT%TZ)"
    printf 'source_root=%s\n' "${ROOT_DIR}"
    printf 'backup_dir=%s\n' "${BACKUP_DIR}"
    printf 'git_commit=%s\n' "$(git rev-parse HEAD 2>/dev/null || true)"
    printf 'git_branch=%s\n' "$(git branch --show-current 2>/dev/null || true)"
  } > "${BACKUP_DIR}/manifest.txt" || ok=0

  chmod -R go-rwx "${BACKUP_DIR}" 2>/dev/null || true

  if [ "${ok}" -eq 1 ] &&
    [ -s "${BACKUP_DIR}/repository-history.bundle" ] &&
    [ -f "${BACKUP_DIR}/manifest.txt" ]; then
    pass "snapshot and protected backup"
  else
    fail "snapshot and protected backup"
  fi
}

check_filesystem_capacity() {
  local min_free_mb="${PHASE01_MIN_FREE_MB:-2048}"
  local min_free_percent="${PHASE01_MIN_FREE_PERCENT:-10}"
  local ok=1
  local free_kb capacity_percent free_mb free_percent inode_capacity_percent inode_free_percent

  if ! df -Pk "${ROOT_DIR}" > "${REPORT_DIR}/filesystem-capacity.txt" 2> "${REPORT_DIR}/filesystem-capacity.err.log"; then
    fail "filesystem capacity"
    return 1
  fi

  read -r free_kb capacity_percent < <(
    awk 'NR==2 {gsub(/%/, "", $5); print $4, $5}' "${REPORT_DIR}/filesystem-capacity.txt"
  )

  free_mb=$((free_kb / 1024))
  free_percent=$((100 - capacity_percent))

  if [ "${free_mb}" -lt "${min_free_mb}" ] ||
    [ "${free_percent}" -lt "${min_free_percent}" ]; then
    ok=0
  fi

  if df -Pi "${ROOT_DIR}" > "${REPORT_DIR}/filesystem-inodes.txt" 2> "${REPORT_DIR}/filesystem-inodes.err.log"; then
    inode_capacity_percent="$(
      awk 'NR==2 {gsub(/%/, "", $5); print $5}' "${REPORT_DIR}/filesystem-inodes.txt"
    )"
    inode_free_percent=$((100 - inode_capacity_percent))
    if [ "${inode_free_percent}" -lt 5 ]; then
      ok=0
    fi
  fi

  {
    printf 'min_free_mb=%s\n' "${min_free_mb}"
    printf 'min_free_percent=%s\n' "${min_free_percent}"
    printf 'actual_free_mb=%s\n' "${free_mb}"
    printf 'actual_free_percent=%s\n' "${free_percent}"
  } > "${REPORT_DIR}/filesystem-thresholds.txt"

  if [ "${ok}" -eq 1 ]; then
    pass "filesystem capacity"
  else
    fail "filesystem capacity"
  fi
}

check_forbidden_content() {
  local ok=1
  local tracked_secret_files
  local forbidden_pattern
  local private_key_header_pattern

  tracked_secret_files="$(
    git ls-files |
      grep -E '(^|/)(\.env($|\.)|terraform\.tfvars($|\.)|[^/]*\.(pem|key|p8|p12|pfx|jks|keystore)$|cosign\.key$)' |
      grep -Ev '(^|/)\.env(\.[^/]*)?\.example$|(^|/)\.env\.example$|(^|/)nginx/certs/\.gitkeep$' || true
  )"

  if [ -n "${tracked_secret_files}" ]; then
    printf '%s\n' "${tracked_secret_files}" > "${REPORT_DIR}/tracked-secret-files.txt"
    ok=0
  fi

  private_key_header_pattern='BEGIN [A-Z0-9 ]*PRIVATE '
  private_key_header_pattern="${private_key_header_pattern}KEY"
  forbidden_pattern="patilsonalias002@gmail\\.com|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|${private_key_header_pattern}"
  if git grep -I -nE "${forbidden_pattern}" -- \
    . \
    ':!reports/**' \
    ':!backend-service/node_modules/**' \
    ':!frontend/node_modules/**' \
    ':!backend-service/dist/**' \
    ':!frontend/dist/**' \
    ':!backend-service/coverage/**' \
    ':!frontend/coverage/**' \
    > "${REPORT_DIR}/forbidden-content.txt" 2> "${REPORT_DIR}/forbidden-content.err.log"; then
    ok=0
  fi

  if [ "${ok}" -eq 1 ]; then
    pass "forbidden-content scan"
  else
    fail "forbidden-content scan"
  fi
}

resolve_trufflehog() {
  TRUFFLEHOG_MODE=""

  if have_command trufflehog; then
    TRUFFLEHOG_MODE="binary"
    trufflehog --version > "${REPORT_DIR}/trufflehog-version.txt" 2>&1 || true
    return 0
  fi

  if ! have_command docker; then
    return 1
  fi

  TRUFFLEHOG_MODE="docker"
  TRUFFLEHOG_IMAGE="${TRUFFLEHOG_IMAGE:-trufflesecurity/trufflehog:3.96.0}"

  if [ "${PHASE01_PULL_TRUFFLEHOG:-1}" = "1" ]; then
    docker pull "${TRUFFLEHOG_IMAGE}" \
      > "${REPORT_DIR}/trufflehog-pull.log" \
      2> "${REPORT_DIR}/trufflehog-pull.err.log" || return 1
  elif ! docker image inspect "${TRUFFLEHOG_IMAGE}" >/dev/null 2>&1; then
    return 1
  fi

  docker image inspect --format '{{range .RepoDigests}}{{.}}{{"\n"}}{{end}}' "${TRUFFLEHOG_IMAGE}" \
    > "${REPORT_DIR}/trufflehog-image-digest.txt" 2>/dev/null || true

  return 0
}

run_trufflehog() {
  local label="$1"
  local log_name="$2"
  shift 2
  local rc

  set +e
  if [ "${TRUFFLEHOG_MODE}" = "binary" ]; then
    trufflehog "$@" \
      > "${REPORT_DIR}/${log_name}.jsonl" \
      2> "${REPORT_DIR}/${log_name}.err.log"
    rc=$?
  else
    docker run --rm "$@" \
      > "${REPORT_DIR}/${log_name}.jsonl" \
      2> "${REPORT_DIR}/${log_name}.err.log"
    rc=$?
  fi
  set -e

  case "${rc}" in
    0)
      pass "${label}"
      ;;
    183)
      note "${label}: TruffleHog found credentials; revoke/rotate, purge, and rerun."
      fail "${label}"
      ;;
    *)
      note "${label}: TruffleHog exited with code ${rc}."
      fail "${label}"
      ;;
  esac
}

check_trufflehog_scans() {
  local exclude_file="${REPORT_DIR}/trufflehog-exclude-paths.txt"
  local repo_parent repo_name

  if ! resolve_trufflehog; then
    note "TruffleHog is not available. Install trufflehog or allow Docker to pull ${TRUFFLEHOG_IMAGE}."
    fail "TruffleHog current-tree scan"
    fail "TruffleHog full-history scan"
    return 1
  fi

  cat > "${exclude_file}" <<'EOF'
/(reports|node_modules|dist|coverage|\.git)/
EOF

  if [ "${TRUFFLEHOG_MODE}" = "binary" ]; then
    run_trufflehog "TruffleHog current-tree scan" "trufflehog-current-tree" \
      filesystem "${ROOT_DIR}" \
      --exclude-paths "${exclude_file}" \
      --results=verified,unknown \
      --fail \
      --json

    run_trufflehog "TruffleHog full-history scan" "trufflehog-full-history" \
      git "file://${ROOT_DIR}" \
      --results=verified,unknown \
      --fail \
      --json
  else
    repo_parent="$(dirname "${ROOT_DIR}")"
    repo_name="$(basename "${ROOT_DIR}")"

    run_trufflehog "TruffleHog current-tree scan" "trufflehog-current-tree" \
      --volume "${repo_parent}:/work:ro" \
      "${TRUFFLEHOG_IMAGE}" \
      filesystem "/work/${repo_name}" \
      --exclude-paths "/work/${repo_name}/reports/phase-01/${RUN_ID}/trufflehog-exclude-paths.txt" \
      --results=verified,unknown \
      --fail \
      --json

    run_trufflehog "TruffleHog full-history scan" "trufflehog-full-history" \
      --volume "${repo_parent}:/work:ro" \
      "${TRUFFLEHOG_IMAGE}" \
      git "file:///work/${repo_name}" \
      --results=verified,unknown \
      --fail \
      --json
  fi
}

check_key_purge_rotation() {
  local evidence_file="${KEY_ROTATION_EVIDENCE_FILE:-${ROOT_DIR}/docs/SECURITY_REMEDIATION.md}"
  local ok=1

  if [ ! -f "${evidence_file}" ]; then
    note "Key rotation evidence file not found: ${evidence_file}"
    fail "previous key purge and rotation"
    return 1
  fi

  cp "${evidence_file}" "${REPORT_DIR}/key-rotation-evidence.txt" 2>/dev/null || true

  if grep -Eiq 'still requires|todo|pending|not complete|incomplete' "${evidence_file}"; then
    ok=0
  fi

  grep -Eiq 'rotat(ed|e|ion)' "${evidence_file}" || ok=0
  grep -Eiq 'purg(ed|e)|rewrit(ten|e)|filter-repo|bfg|history cleanup|history cleaned' "${evidence_file}" || ok=0
  grep -Eiq 'revok(ed|e)|replac(ed|e)|regenerat(ed|e)' "${evidence_file}" || ok=0

  if [ "${ok}" -eq 1 ]; then
    pass "previous key purge and rotation"
  else
    note "Update ${evidence_file} with completed revoke/rotate and Git-history purge evidence."
    fail "previous key purge and rotation"
  fi
}

check_five_backend_builds() {
  local ok=1

  pushd "${ROOT_DIR}/backend-service" >/dev/null
  run_substep "backend-build-auth" npm run build:auth || ok=0
  run_substep "backend-build-account" npm run build:account || ok=0
  run_substep "backend-build-transaction" npm run build:transaction || ok=0
  run_substep "backend-build-payment" npm run build:payment || ok=0
  run_substep "backend-build-notification" npm run build:notification || ok=0
  popd >/dev/null

  if [ "${ok}" -eq 1 ]; then
    pass "five backend builds"
  else
    fail "five backend builds"
  fi
}

check_compose_config() {
  local compose_env_file="${COMPOSE_ENV_FILE:-${ROOT_DIR}/backend-service/.env}"

  if [ ! -f "${compose_env_file}" ]; then
    note "Compose env file not found: ${compose_env_file}"
    fail "compose-config"
    return 1
  fi

  pushd "${ROOT_DIR}/backend-service" >/dev/null
  run_check "compose-config" "compose-config" \
    docker compose --env-file "${compose_env_file}" -f docker-compose.yml config --quiet || true
  popd >/dev/null
}

curl_endpoint() {
  local path="$1"
  local base_url="${GATEWAY_BASE_URL:-https://127.0.0.1}"

  curl --fail --silent --show-error --insecure --max-time "${CURL_MAX_TIME_SECONDS:-10}" \
    "${base_url}${path}"
}

check_gateway_endpoints() {
  local kind="$1"
  local label="$2"
  local ok=1
  local route

  for route in auth accounts transactions payments notifications; do
    curl_endpoint "/${kind}/${route}" \
      > "${REPORT_DIR}/${kind}-${route}.log" \
      2> "${REPORT_DIR}/${kind}-${route}.err.log" || ok=0
  done

  if [ "${ok}" -eq 1 ]; then
    pass "${label}"
  else
    fail "${label}"
  fi
}

check_public_port_review() {
  local ok=1
  local allowed_ports_csv="${ALLOWED_PUBLIC_PORTS:-22,80,443}"
  local rendered_compose="${REPORT_DIR}/compose-public-port-review.yml"

  pushd "${ROOT_DIR}/backend-service" >/dev/null
  docker compose --env-file "${COMPOSE_ENV_FILE:-${ROOT_DIR}/backend-service/.env}" \
    -f docker-compose.yml config \
    > "${rendered_compose}" 2> "${REPORT_DIR}/compose-public-port-review.err.log" || ok=0
  popd >/dev/null

  if grep -Eq '0\.0\.0\.0:|\[::\]:' "${ROOT_DIR}/backend-service/docker-compose.yml"; then
    ok=0
    grep -En '0\.0\.0\.0:|\[::\]:' "${ROOT_DIR}/backend-service/docker-compose.yml" \
      > "${REPORT_DIR}/compose-public-bindings.txt" || true
  fi

  if have_command ss; then
    ss -H -ltn > "${REPORT_DIR}/listening-tcp-ports.txt" 2> "${REPORT_DIR}/listening-tcp-ports.err.log" || true
  elif have_command netstat; then
    netstat -ltn > "${REPORT_DIR}/listening-tcp-ports.txt" 2> "${REPORT_DIR}/listening-tcp-ports.err.log" || true
  else
    : > "${REPORT_DIR}/listening-tcp-ports.txt"
  fi

  awk -v allowed_csv="${allowed_ports_csv}" '
    BEGIN {
      split(allowed_csv, allowed, ",")
      for (i in allowed) {
        gsub(/^ +| +$/, "", allowed[i])
        allowed_port[allowed[i]] = 1
      }
    }
    /(^|[[:space:]])(0\.0\.0\.0|\*|\[::\]|:::)/ {
      local_address = $4
      if (local_address == "") {
        local_address = $1
      }
      port = local_address
      sub(/^.*:/, "", port)
      gsub(/[^0-9]/, "", port)
      if (port != "" && !(port in allowed_port)) {
        print $0
      }
    }
  ' "${REPORT_DIR}/listening-tcp-ports.txt" > "${REPORT_DIR}/unexpected-public-ports.txt" || true

  if [ -s "${REPORT_DIR}/unexpected-public-ports.txt" ]; then
    ok=0
  fi

  if [ "${ok}" -eq 1 ]; then
    pass "public-port-review"
  else
    note "Allowed public ports: ${allowed_ports_csv}. See public port review logs."
    fail "public-port-review"
  fi
}

check_budget_alerts() {
  local evidence_file="${BUDGET_ALERTS_EVIDENCE_FILE:-${ROOT_DIR}/docs/BUDGET_ALERTS.md}"
  local ok=0

  if have_command aws &&
    [ -n "${AWS_ACCOUNT_ID:-}" ] &&
    [ -n "${AWS_BUDGET_NAME:-}" ]; then
    if aws budgets describe-budget \
      --account-id "${AWS_ACCOUNT_ID}" \
      --budget-name "${AWS_BUDGET_NAME}" \
      > "${REPORT_DIR}/aws-budget.json" \
      2> "${REPORT_DIR}/aws-budget.err.log" &&
      aws budgets describe-notifications-for-budget \
        --account-id "${AWS_ACCOUNT_ID}" \
        --budget-name "${AWS_BUDGET_NAME}" \
        > "${REPORT_DIR}/aws-budget-notifications.json" \
        2> "${REPORT_DIR}/aws-budget-notifications.err.log" &&
      grep -Eq '"NotificationType"|"Threshold"' "${REPORT_DIR}/aws-budget-notifications.json"; then
      ok=1
    fi
  fi

  if [ "${ok}" -eq 0 ] && [ -f "${evidence_file}" ]; then
    cp "${evidence_file}" "${REPORT_DIR}/budget-alerts-evidence.txt" 2>/dev/null || true
    if grep -Eiq 'budget' "${evidence_file}" &&
      grep -Eiq 'alert|notification|alarm' "${evidence_file}" &&
      grep -Eiq 'threshold|limit|amount' "${evidence_file}" &&
      ! grep -Eiq 'todo|pending|not complete|incomplete' "${evidence_file}"; then
      ok=1
    fi
  fi

  if [ "${ok}" -eq 1 ]; then
    pass "budget-alerts"
  else
    note "Provide AWS_BUDGET_NAME/AWS_ACCOUNT_ID with AWS CLI access, or add completed evidence at ${evidence_file}."
    fail "budget-alerts"
  fi
}

check_pull_request_review() {
  local evidence_file="${PR_REVIEW_EVIDENCE_FILE:-${ROOT_DIR}/docs/PULL_REQUEST_REVIEW.md}"
  local ok=0
  local pr_ref="${PR_NUMBER:-}"

  if have_command gh; then
    if [ -z "${pr_ref}" ]; then
      pr_ref="$(git branch --show-current 2>/dev/null || true)"
    fi

    if [ -n "${pr_ref}" ] &&
      gh pr view "${pr_ref}" --json reviewDecision,reviews \
        > "${REPORT_DIR}/pull-request-review.json" \
        2> "${REPORT_DIR}/pull-request-review.err.log" &&
      grep -Eq '"reviewDecision"[[:space:]]*:[[:space:]]*"APPROVED"' "${REPORT_DIR}/pull-request-review.json"; then
      ok=1
    fi
  fi

  if [ "${ok}" -eq 0 ] && [ -f "${evidence_file}" ]; then
    cp "${evidence_file}" "${REPORT_DIR}/pull-request-review-evidence.txt" 2>/dev/null || true
    if grep -Eiq 'approved|reviewed|review decision:[[:space:]]*approved' "${evidence_file}" &&
      ! grep -Eiq 'todo|pending|not complete|incomplete' "${evidence_file}"; then
      ok=1
    fi
  fi

  if [ "${ok}" -eq 1 ]; then
    pass "pull-request-review"
  else
    note "Provide a reviewed PR through gh, or add completed evidence at ${evidence_file}."
    fail "pull-request-review"
  fi
}

check_protected_main_merge() {
  local evidence_file="${PROTECTED_MAIN_EVIDENCE_FILE:-${ROOT_DIR}/docs/PROTECTED_MAIN_MERGE.md}"
  local ok=0

  if have_command gh; then
    if gh api "repos/{owner}/{repo}/branches/main/protection" \
      > "${REPORT_DIR}/main-branch-protection.json" \
      2> "${REPORT_DIR}/main-branch-protection.err.log" &&
      grep -Eq 'required_pull_request_reviews|required_status_checks' "${REPORT_DIR}/main-branch-protection.json"; then
      ok=1
    fi
  fi

  if [ "${ok}" -eq 0 ] && [ -f "${evidence_file}" ]; then
    cp "${evidence_file}" "${REPORT_DIR}/protected-main-merge-evidence.txt" 2>/dev/null || true
    if grep -Eiq 'protected|branch protection|required review|required status|required check' "${evidence_file}" &&
      grep -Eiq 'main' "${evidence_file}" &&
      ! grep -Eiq 'todo|pending|not complete|incomplete' "${evidence_file}"; then
      ok=1
    fi
  fi

  if [ "${ok}" -eq 1 ]; then
    pass "protected-main-merge"
  else
    note "Enable main branch protection via GitHub, or add completed evidence at ${evidence_file}."
    fail "protected-main-merge"
  fi
}

cd "${ROOT_DIR}"

for command_name in git bash node npm docker curl df; do
  require_command "${command_name}" || true
done

write_environment_report
check_working_tree

check_snapshot_and_backup
check_filesystem_capacity
run_check "repository-validator" "repository-validator" bash "${ROOT_DIR}/ci/scripts/validate-repository.sh" || true
check_forbidden_content
check_trufflehog_scans || true
check_key_purge_rotation

pushd "${ROOT_DIR}/backend-service" >/dev/null
run_required "backend-npm-ci" "backend dependency install" npm ci --legacy-peer-deps || true
run_check "backend-lint-check" "backend-lint-check" npx eslint "{apps,libs,test}/**/*.ts" --max-warnings=0 || true
popd >/dev/null

check_five_backend_builds

pushd "${ROOT_DIR}/backend-service" >/dev/null
run_check "backend-tests" "backend-tests" npm test || true
run_check "global-backend-coverage-50" "global-backend-coverage-50" npx jest --coverage --runInBand \
  --coverageThreshold='{"global":{"branches":50,"functions":50,"lines":50,"statements":50}}' || true
popd >/dev/null

pushd "${ROOT_DIR}/frontend" >/dev/null
run_required "frontend-npm-ci" "frontend dependency install" npm ci || true
run_check "frontend-typecheck" "frontend-typecheck" npm run typecheck || true
run_check "frontend-build" "frontend-build" npm run build || true
popd >/dev/null

check_compose_config
check_gateway_endpoints "health" "five health endpoints"
check_gateway_endpoints "metrics" "five metrics endpoints"
check_public_port_review
check_budget_alerts
check_pull_request_review
check_protected_main_merge

printf '\nPhase 1 result: %s failures, %s warnings\n' "${failures}" "${warnings}" |
  tee -a "${REPORT_DIR}/summary.log"

if [ "${failures}" -eq 0 ] && [ "${warnings}" -eq 0 ]; then
  printf 'Decision: GO FOR PHASE 2\n' | tee -a "${REPORT_DIR}/summary.log"
  printf 'Evidence directory: %s\n' "${REPORT_DIR}" | tee -a "${REPORT_DIR}/summary.log"
  exit 0
fi

printf 'Decision: STOP - FIX PHASE 1\n' | tee -a "${REPORT_DIR}/summary.log"
printf 'Evidence directory: %s\n' "${REPORT_DIR}" | tee -a "${REPORT_DIR}/summary.log"
exit 1
