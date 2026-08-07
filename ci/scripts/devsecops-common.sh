#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_MAP="${SERVICE_MAP:-${ROOT_DIR}/config/service-map.txt}"
REPORT_ROOT="${REPORT_ROOT:-${ROOT_DIR}/reports}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
REPORT_DIR="${REPORT_DIR:-${REPORT_ROOT}/devsecops/${RUN_ID}}"

IMAGE_TAG="${IMAGE_TAG:-}"
HARBOR_REGISTRY="${HARBOR_REGISTRY:-}"
HARBOR_PROJECT="${HARBOR_PROJECT:-vault-bank}"
LOCAL_IMAGE_PREFIX="${LOCAL_IMAGE_PREFIX:-vaultbank}"
COSIGN_KEY_REF="${COSIGN_KEY_REF:-awskms:///alias/vaultbank-cosign}"

mkdir -p "${REPORT_DIR}"

# shellcheck source=ci/scripts/parse-service-map.sh
source "${SCRIPT_DIR}/parse-service-map.sh"

log() {
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

use_phase_report_dir() {
  local phase="$1"
  REPORT_DIR="${REPORT_ROOT}/${phase}"
  mkdir -p "${REPORT_DIR}"
}

short_commit() {
  git -C "${ROOT_DIR}" rev-parse --short=12 HEAD
}

full_commit() {
  git -C "${ROOT_DIR}" rev-parse HEAD
}

normalized_branch() {
  local branch="${BRANCH_NAME:-${CHANGE_BRANCH:-}}"
  if [ -z "${branch}" ]; then
    branch="$(git -C "${ROOT_DIR}" branch --show-current 2>/dev/null || true)"
  fi
  if [ -z "${branch}" ]; then
    branch="detached"
  fi
  printf '%s' "${branch}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

ci_image_tag() {
  if [ -n "${IMAGE_TAG}" ]; then
    printf '%s\n' "${IMAGE_TAG}"
    return
  fi
  local build_number="${BUILD_NUMBER:-local}"
  printf '%s-%s-%s\n' "$(normalized_branch)" "$(short_commit)" "${build_number}"
}

local_image_repo() {
  local service="$1"
  printf '%s/%s\n' "${LOCAL_IMAGE_PREFIX}" "${service}"
}

local_image_ref() {
  local service="$1"
  printf '%s:%s\n' "$(local_image_repo "${service}")" "$(ci_image_tag)"
}

harbor_image_repo() {
  local service="$1"
  [ -n "${HARBOR_REGISTRY}" ] || die "HARBOR_REGISTRY is required"
  printf '%s/%s/%s\n' "${HARBOR_REGISTRY}" "${HARBOR_PROJECT}" "${service}"
}

harbor_image_ref() {
  local service="$1"
  printf '%s:%s\n' "$(harbor_image_repo "${service}")" "$(ci_image_tag)"
}

safe_name() {
  printf '%s' "$1" | tr '/:@' '____'
}

run_logged() {
  local name="$1"
  shift
  local stdout_log="${REPORT_DIR}/${name}.log"
  local stderr_log="${REPORT_DIR}/${name}.err.log"
  local heartbeat_interval="${RUN_LOGGED_HEARTBEAT_INTERVAL:-60}"
  local command_pid
  local heartbeat_pid
  local rc=0

  log "running ${name}"

  "$@" > >(tee "${stdout_log}") 2> >(tee "${stderr_log}" >&2) &
  command_pid=$!

  (
    set +e
    elapsed=0
    while kill -0 "${command_pid}" >/dev/null 2>&1; do
      sleep "${heartbeat_interval}" || exit 0
      if kill -0 "${command_pid}" >/dev/null 2>&1; then
        elapsed=$((elapsed + heartbeat_interval))
        log "still running ${name} (${elapsed}s elapsed)"
      fi
    done
  ) &
  heartbeat_pid=$!

  if wait "${command_pid}"; then
    rc=0
  else
    rc=$?
  fi

  kill "${heartbeat_pid}" >/dev/null 2>&1 || true
  wait "${heartbeat_pid}" >/dev/null 2>&1 || true
  return "${rc}"
}
