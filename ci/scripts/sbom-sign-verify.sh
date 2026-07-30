#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

IMAGE_LIST="${IMAGE_LIST:-${REPORT_DIR}/images.txt}"
SBOM_DIR="${REPORT_DIR}/sbom"
COSIGN_YES="${COSIGN_YES:-true}"

[ -s "${IMAGE_LIST}" ] || die "image list not found: ${IMAGE_LIST}; run build-images.sh first"
mkdir -p "${SBOM_DIR}"

require_command cosign

if ! command -v syft >/dev/null 2>&1 && ! command -v docker >/dev/null 2>&1; then
  die "syft or docker is required for SBOM generation"
fi

sign_args=()
if [ "${COSIGN_YES}" = "true" ]; then
  sign_args+=(--yes)
fi
if [ -n "${COSIGN_KEY:-}" ]; then
  sign_args+=(--key "${COSIGN_KEY}")
elif [ "${COSIGN_KEYLESS:-0}" != "1" ]; then
  die "set COSIGN_KEY for key-based signing or COSIGN_KEYLESS=1 for OIDC keyless signing"
fi

verify_args=()
if [ -n "${COSIGN_KEY:-}" ]; then
  verify_args+=(--key "${COSIGN_KEY}")
else
  [ -n "${COSIGN_CERT_IDENTITY:-}" ] || die "COSIGN_CERT_IDENTITY is required for keyless verify"
  [ -n "${COSIGN_CERT_OIDC_ISSUER:-}" ] || die "COSIGN_CERT_OIDC_ISSUER is required for keyless verify"
  verify_args+=(--certificate-identity "${COSIGN_CERT_IDENTITY}" --certificate-oidc-issuer "${COSIGN_CERT_OIDC_ISSUER}")
fi

while IFS= read -r image; do
  [ -n "${image}" ] || continue
  safe_name="$(printf '%s' "${image}" | tr '/:@' '____')"

  if command -v syft >/dev/null 2>&1; then
    run_logged "syft-sbom-${safe_name}" syft "${image}" \
      -o "cyclonedx-json=${SBOM_DIR}/${safe_name}.cdx.json"
  else
    run_logged "syft-sbom-${safe_name}" docker run --rm \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v "${SBOM_DIR}:/sbom" \
      anchore/syft:latest "${image}" \
      -o "cyclonedx-json=/sbom/${safe_name}.cdx.json"
  fi

  run_logged "cosign-sign-${safe_name}" cosign sign "${sign_args[@]}" "${image}"
  run_logged "cosign-verify-${safe_name}" cosign verify "${verify_args[@]}" "${image}"
done < "${IMAGE_LIST}"

log "PASS: Syft SBOM and Cosign signing verification"
