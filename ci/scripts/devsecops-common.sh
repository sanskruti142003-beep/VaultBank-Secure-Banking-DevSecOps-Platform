#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SERVICE_MAP="${ROOT_DIR}/config/service-map.txt"
REPORT_ROOT="${REPORT_ROOT:-${ROOT_DIR}/reports/devsecops}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
REPORT_DIR="${REPORT_DIR:-${REPORT_ROOT}/${RUN_ID}}"

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
ECR_REPOSITORY_PREFIX="${ECR_REPOSITORY_PREFIX:-vaultbank}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "${ROOT_DIR}" rev-parse --short=12 HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)}"

mkdir -p "${REPORT_DIR}"

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

ecr_registry() {
  if [ -z "${AWS_ACCOUNT_ID}" ]; then
    die "AWS_ACCOUNT_ID is required for ECR image references"
  fi
  printf '%s.dkr.ecr.%s.amazonaws.com\n' "${AWS_ACCOUNT_ID}" "${AWS_REGION}"
}

image_repo() {
  local service="$1"
  printf '%s/%s/%s\n' "$(ecr_registry)" "${ECR_REPOSITORY_PREFIX}" "${service}"
}

image_ref() {
  local service="$1"
  printf '%s:%s\n' "$(image_repo "${service}")" "${IMAGE_TAG}"
}

backend_services() {
  awk -F'|' '$1 !~ /^($|#)/ && $2 == "backend" {print $1}' "${SERVICE_MAP}"
}

frontend_services() {
  awk -F'|' '$1 !~ /^($|#)/ && $2 == "frontend" {print $1}' "${SERVICE_MAP}"
}

write_image_list() {
  local output="${1:-${REPORT_DIR}/images.txt}"
  : > "${output}"
  backend_services | while read -r service; do
    printf '%s\n' "$(image_ref "${service}")" >> "${output}"
  done
  if [ "${BUILD_FRONTEND_IMAGE:-1}" = "1" ]; then
    printf '%s\n' "$(image_ref "frontend")" >> "${output}"
  fi
  if [ "${BUILD_GATEWAY_IMAGE:-1}" = "1" ]; then
    printf '%s\n' "$(image_ref "nginx-gateway")" >> "${output}"
  fi
}

run_logged() {
  local name="$1"
  shift
  log "running ${name}"
  "$@" > >(tee "${REPORT_DIR}/${name}.log") \
    2> >(tee "${REPORT_DIR}/${name}.err.log" >&2)
}
