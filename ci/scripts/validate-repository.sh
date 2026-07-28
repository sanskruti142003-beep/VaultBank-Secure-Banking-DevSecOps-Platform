#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SERVICE_MAP="${ROOT_DIR}/config/service-map.txt"

failures=0

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

require_file() {
  local path="$1"
  local label="$2"
  if [ -f "${ROOT_DIR}/${path}" ]; then
    pass "${label}: ${path}"
  else
    fail "${label} missing: ${path}"
  fi
}

require_dir() {
  local path="$1"
  local label="$2"
  if [ -d "${ROOT_DIR}/${path}" ]; then
    pass "${label}: ${path}"
  else
    fail "${label} missing: ${path}"
  fi
}

if [ ! -f "$SERVICE_MAP" ]; then
  fail 'config/service-map.txt is required'
else
  pass 'service map found'
fi

while IFS='|' read -r name kind context dockerfile build_arg health_path metrics_path _notes; do
  case "${name}" in
    ''|\#*) continue ;;
  esac

  require_dir "$context" "${name} build context"
  require_file "$dockerfile" "${name} Dockerfile"

  if [ "$kind" = 'backend' ]; then
    service_name="${build_arg#SERVICE_NAME=}"
    if [ -z "$service_name" ] || [ "$service_name" = "$build_arg" ]; then
      fail "${name} must provide SERVICE_NAME build_arg"
      continue
    fi

    require_dir "backend-service/apps/${service_name}" "${name} NestJS app"

    if grep -q 'ARG SERVICE_NAME' "${ROOT_DIR}/${dockerfile}"; then
      pass "${name} Dockerfile accepts SERVICE_NAME"
    else
      fail "${name} Dockerfile does not accept SERVICE_NAME"
    fi

    if [ "$health_path" = '/v1/health' ]; then
      pass "${name} health path is /v1/health"
    else
      fail "${name} health path must be /v1/health"
    fi

    if [ "$metrics_path" = '/v1/metrics' ]; then
      pass "${name} metrics path is /v1/metrics"
    else
      fail "${name} metrics path must be /v1/metrics"
    fi
  fi
done < "$SERVICE_MAP"

require_file 'frontend/Dockerfile' 'frontend production Dockerfile'
require_file 'frontend/nginx.conf' 'frontend Nginx runtime config'
require_file 'backend-service/libs/common/src/health/health.controller.ts' 'shared health controller'
require_file 'backend-service/libs/common/src/metrics/metrics.controller.ts' 'shared metrics controller'
require_file 'backend-service/libs/common/src/metrics/metrics.service.ts' 'shared metrics service'

if grep -q '/v1/health' "${ROOT_DIR}/backend-service/nginx/conf.d/banking-api-ssl.conf"; then
  pass 'gateway health mappings target /v1/health'
else
  fail 'gateway health mappings must target /v1/health'
fi

if grep -q '/v1/metrics' "${ROOT_DIR}/backend-service/nginx/conf.d/banking-api-ssl.conf"; then
  pass 'gateway metrics mappings target /v1/metrics'
else
  fail 'gateway metrics mappings must target /v1/metrics'
fi

if grep -q "event: 'audit.request'" "${ROOT_DIR}/backend-service/libs/common/src/interceptors/logging.interceptor.ts"; then
  pass 'audit requests are logged as structured stdout JSON'
else
  fail 'audit requests must be logged as structured stdout JSON'
fi

if [ -f "${ROOT_DIR}/docs/ARCHITECTURE_GAPS.md" ] &&
  grep -q 'notification-service' "${ROOT_DIR}/docs/ARCHITECTURE_GAPS.md"; then
  pass 'notification-service gap is documented'
else
  fail 'notification-service architecture gap must be documented'
fi

tracked_keys="$(git -C "$ROOT_DIR" ls-files '*self-signed.key' '*.pem' '*.p8' 2>/dev/null || true)"
if [ -n "$tracked_keys" ]; then
  fail "private key material is tracked in Git: ${tracked_keys}"
else
  pass 'no development private keys are tracked'
fi

if git -C "$ROOT_DIR" grep -n 'BEGIN .*PRIVATE KEY' -- . ':!backend-service/nginx/certs/*' >/tmp/vaultbank-private-key-scan.txt 2>/dev/null; then
  cat /tmp/vaultbank-private-key-scan.txt >&2
  fail 'private key material found outside ignored local cert folder'
else
  pass 'no private key material found in source files'
fi

if [ "$failures" -gt 0 ]; then
  printf '\nRepository validation failed with %s issue(s).\n' "$failures" >&2
  exit 1
fi

printf '\nRepository validation passed.\n'
