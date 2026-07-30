#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

require_command docker

cd "${ROOT_DIR}"
: > "${REPORT_DIR}/images.txt"

backend_services | while read -r service; do
  image="$(image_ref "${service}")"
  run_logged "docker-build-${service}" docker build \
    --file "${ROOT_DIR}/backend-service/Dockerfile" \
    --build-arg "SERVICE_NAME=${service}" \
    --label "org.opencontainers.image.source=${GIT_URL:-local}" \
    --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
    --label "dev.vaultbank.service=${service}" \
    --tag "${image}" \
    "${ROOT_DIR}/backend-service"
  printf '%s\n' "${image}" >> "${REPORT_DIR}/images.txt"
done

if [ "${BUILD_GATEWAY_IMAGE:-1}" = "1" ]; then
  image="$(image_ref "nginx-gateway")"
  gateway_dockerfile="${ROOT_DIR}/backend-service/nginx/Dockerfile"
  if [ "${USE_MODSECURITY_GATEWAY:-0}" = "1" ]; then
    gateway_dockerfile="${ROOT_DIR}/backend-service/nginx/Dockerfile.modsecurity"
  fi
  run_logged "docker-build-nginx-gateway" docker build \
    --file "${gateway_dockerfile}" \
    --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
    --label "dev.vaultbank.service=nginx-gateway" \
    --tag "${image}" \
    "${ROOT_DIR}/backend-service/nginx"
  printf '%s\n' "${image}" >> "${REPORT_DIR}/images.txt"
fi

if [ "${BUILD_FRONTEND_IMAGE:-1}" = "1" ]; then
  image="$(image_ref "frontend")"
  run_logged "docker-build-frontend" docker build \
    --file "${ROOT_DIR}/frontend/Dockerfile" \
    --build-arg "VITE_API_BASE_URL=${VITE_API_BASE_URL:-/api}" \
    --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
    --label "dev.vaultbank.service=frontend" \
    --tag "${image}" \
    "${ROOT_DIR}/frontend"
  printf '%s\n' "${image}" >> "${REPORT_DIR}/images.txt"
fi

log "PASS: Docker multi-stage image build"
