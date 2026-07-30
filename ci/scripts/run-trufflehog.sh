#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-03-trufflehog"

MODE="${1:-all}"
TRUFFLEHOG_IMAGE="${TRUFFLEHOG_IMAGE:-trufflesecurity/trufflehog:3.96.0}"
EXCLUDE_FILE="${REPORT_DIR}/exclude-paths.txt"
SANITIZED_SUMMARY="${REPORT_DIR}/sanitized-summary.jsonl"

cat > "${EXCLUDE_FILE}" <<'EOF'
/(node_modules|dist|coverage|reports|\.git)/
EOF

if [ "${MODE}" = "all" ] || [ "${MODE}" = "current" ]; then
  : > "${SANITIZED_SUMMARY}"
else
  touch "${SANITIZED_SUMMARY}"
fi

sanitize_jsonl() {
  local input="$1"
  local label="$2"
  python3 - "$input" "$label" >> "${SANITIZED_SUMMARY}" <<'PY'
import json
import sys

path, label = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8", errors="replace") as handle:
    for line in handle:
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        source = item.get("SourceMetadata", {}).get("Data", {})
        print(json.dumps({
            "scan": label,
            "detector": item.get("DetectorName"),
            "verified": item.get("Verified"),
            "file": source.get("Filesystem", {}).get("file") or source.get("Git", {}).get("file"),
            "line": source.get("Filesystem", {}).get("line") or source.get("Git", {}).get("line"),
            "commit": source.get("Git", {}).get("commit"),
        }, sort_keys=True))
PY
}

run_trufflehog_scan() {
  local label="$1"
  local output="$2"
  shift 2
  local rc

  set +e
  "$@" > "${output}" 2> "${output%.jsonl}.err.log"
  rc=$?
  set -e
  chmod 600 "${output}" "${output%.jsonl}.err.log" 2>/dev/null || true

  set +e
  sanitize_jsonl "${output}" "${label}"
  sanitize_rc=$?

  if command -v shred >/dev/null 2>&1; then
    shred --force --remove "${output}" 2>/dev/null || rm -f "${output}"
  else
    rm -f "${output}"
  fi

  set -e

  if [ "${sanitize_rc}" -ne 0 ]; then
    die "${label} could not create a sanitized report"
  fi

  case "${rc}" in
    0)
      log "PASS: ${label}"
      ;;
    183)
      die "${label} found verified credentials. Revoke, rotate, purge history if needed, and rerun."
      ;;
    *)
      die "${label} failed with exit code ${rc}"
      ;;
  esac
}

cd "${ROOT_DIR}"
require_command python3

if command -v trufflehog >/dev/null 2>&1; then
  trufflehog --version > "${REPORT_DIR}/trufflehog-version.txt" 2>&1 || true
  if [ "${MODE}" = "all" ] || [ "${MODE}" = "current" ]; then
    run_trufflehog_scan "TruffleHog current-tree scan" "${REPORT_DIR}/current-tree.jsonl" \
      trufflehog --no-update filesystem "${ROOT_DIR}" \
        --exclude-paths "${EXCLUDE_FILE}" \
        --results=verified \
        --fail \
        --json
  fi

  if [ "${MODE}" = "all" ] || [ "${MODE}" = "history" ]; then
    run_trufflehog_scan "TruffleHog full-history scan" "${REPORT_DIR}/full-history.jsonl" \
      trufflehog --no-update git "file://${ROOT_DIR}" \
        --results=verified \
        --fail \
        --json
  fi
else
  require_command docker
  docker pull "${TRUFFLEHOG_IMAGE}" > "${REPORT_DIR}/trufflehog-pull.log" 2> "${REPORT_DIR}/trufflehog-pull.err.log"
  REPO_PARENT="$(dirname "${ROOT_DIR}")"
  REPO_NAME="$(basename "${ROOT_DIR}")"
  if [ "${MODE}" = "all" ] || [ "${MODE}" = "current" ]; then
    run_trufflehog_scan "TruffleHog current-tree scan" "${REPORT_DIR}/current-tree.jsonl" \
      docker run --rm \
        --volume "${REPO_PARENT}:/work:ro" \
        "${TRUFFLEHOG_IMAGE}" \
        --no-update filesystem "/work/${REPO_NAME}" \
        --exclude-paths "/work/${REPO_NAME}/reports/phase-03-trufflehog/exclude-paths.txt" \
        --results=verified \
        --fail \
        --json
  fi

  if [ "${MODE}" = "all" ] || [ "${MODE}" = "history" ]; then
    run_trufflehog_scan "TruffleHog full-history scan" "${REPORT_DIR}/full-history.jsonl" \
      docker run --rm \
        --volume "${REPO_PARENT}:/work:ro" \
        "${TRUFFLEHOG_IMAGE}" \
        --no-update git "file:///work/${REPO_NAME}" \
        --results=verified \
        --fail \
        --json
  fi
fi

case "${MODE}" in
  all|current|history) ;;
  *) die "unknown TruffleHog mode: ${MODE}" ;;
esac
