#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

require_command kustomize

ENVIRONMENT="${1:-staging}"
OVERLAY_DIR="${ROOT_DIR}/gitops/overlays/${ENVIRONMENT}"
[ -d "${OVERLAY_DIR}" ] || die "unknown GitOps overlay: ${ENVIRONMENT}"

cd "${OVERLAY_DIR}"
backend_services | while read -r service; do
  kustomize edit set image "${service}=$(image_ref "${service}")"
done
if [ "${BUILD_FRONTEND_IMAGE:-1}" = "1" ]; then
  kustomize edit set image "frontend=$(image_ref "frontend")"
fi
if [ "${BUILD_GATEWAY_IMAGE:-1}" = "1" ]; then
  kustomize edit set image "nginx-gateway=$(image_ref "nginx-gateway")"
fi

git -C "${ROOT_DIR}" diff -- "${OVERLAY_DIR}/kustomization.yaml" > "${REPORT_DIR}/gitops-${ENVIRONMENT}-image-update.diff" || true
log "PASS: GitOps ${ENVIRONMENT} image update"
