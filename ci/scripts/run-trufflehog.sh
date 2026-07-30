#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

TRUFFLEHOG_IMAGE="${TRUFFLEHOG_IMAGE:-trufflesecurity/trufflehog:latest}"
EXCLUDE_FILE="${REPORT_DIR}/trufflehog-exclude-paths.txt"

cat > "${EXCLUDE_FILE}" <<'EOF'
/(node_modules|dist|coverage|reports|\.git)/
EOF

run_trufflehog_scan() {
  local label="$1"
  local log_name="$2"
  shift 2
  local rc

  set +e
  "$@" > "${REPORT_DIR}/${log_name}.jsonl" 2> "${REPORT_DIR}/${log_name}.err.log"
  rc=$?
  set -e

  case "${rc}" in
    0)
      log "PASS: ${label}"
      ;;
    183)
      die "${label} found verified or unknown secret material. Rotate, purge history if needed, and rerun."
      ;;
    *)
      die "${label} execution failed with exit code ${rc}; see ${REPORT_DIR}/${log_name}.err.log"
      ;;
  esac
}

cd "${ROOT_DIR}"

if command -v trufflehog >/dev/null 2>&1; then
  trufflehog --version > "${REPORT_DIR}/trufflehog-version.txt" 2>&1 || true
  run_trufflehog_scan "TruffleHog current-tree scan" "trufflehog-current-tree" \
    trufflehog filesystem "${ROOT_DIR}" \
    --exclude-paths "${EXCLUDE_FILE}" \
    --results=verified,unknown \
    --fail \
    --json

  run_trufflehog_scan "TruffleHog full-history scan" "trufflehog-full-history" \
    trufflehog git "file://${ROOT_DIR}" \
    --results=verified,unknown \
    --fail \
    --json
  exit 0
fi

require_command docker
docker pull "${TRUFFLEHOG_IMAGE}" > "${REPORT_DIR}/trufflehog-pull.log" 2> "${REPORT_DIR}/trufflehog-pull.err.log"
docker image inspect --format '{{range .RepoDigests}}{{.}}{{"\n"}}{{end}}' "${TRUFFLEHOG_IMAGE}" \
  > "${REPORT_DIR}/trufflehog-image-digest.txt" 2>/dev/null || true

REPO_PARENT="$(dirname "${ROOT_DIR}")"
REPO_NAME="$(basename "${ROOT_DIR}")"

run_trufflehog_scan "TruffleHog current-tree scan" "trufflehog-current-tree" \
  docker run --rm \
  --volume "${REPO_PARENT}:/work:ro" \
  "${TRUFFLEHOG_IMAGE}" \
  filesystem "/work/${REPO_NAME}" \
  --exclude-paths "/work/${REPO_NAME}/reports/devsecops/${RUN_ID}/trufflehog-exclude-paths.txt" \
  --results=verified,unknown \
  --fail \
  --json

run_trufflehog_scan "TruffleHog full-history scan" "trufflehog-full-history" \
  docker run --rm \
  --volume "${REPO_PARENT}:/work:ro" \
  "${TRUFFLEHOG_IMAGE}" \
  git "file:///work/${REPO_NAME}" \
  --results=verified,unknown \
  --fail \
  --json
