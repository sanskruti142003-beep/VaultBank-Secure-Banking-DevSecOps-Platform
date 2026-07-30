#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-10-harbor"

MODE="${1:-all}"
IMAGE_LIST="${IMAGE_LIST:-${ROOT_DIR}/reports/phase-07-build/images.txt}"
SBOM_DIR="${SBOM_DIR:-${ROOT_DIR}/reports/phase-09-sbom}"
TRIVY_IGNORE_FILE="${ROOT_DIR}/.trivyignore.yaml"
DIGEST_MANIFEST="${REPORT_DIR}/digest-manifest.jsonl"
STATUS_DIR="${REPORT_DIR}/status"

require_command python3
mkdir -p "${REPORT_DIR}/post-push-trivy" "${REPORT_DIR}/cosign" "${STATUS_DIR}"

require_digest_manifest() {
  [ -s "${DIGEST_MANIFEST}" ] || die "digest manifest missing: run publish-harbor.sh push first"
}

read_digest_rows() {
  python3 - "${DIGEST_MANIFEST}" <<'PY'
import json
import sys

for line in open(sys.argv[1], "r", encoding="utf-8"):
    if not line.strip():
        continue
    row = json.loads(line)
    print("|".join([row["service"], row["harbor_image"], row["digest"], row["cyclonedx"]]))
PY
}

harbor_login() {
  [ -n "${HARBOR_REGISTRY}" ] || die "HARBOR_REGISTRY is required"
  [ -n "${HARBOR_USERNAME:-}" ] || die "HARBOR_USERNAME is required from Jenkins credential harbor-robot"
  [ -n "${HARBOR_PASSWORD:-}" ] || die "HARBOR_PASSWORD is required from Jenkins credential harbor-robot"
  if [ -n "${HARBOR_CA_CERT:-}" ] && [ -f "${HARBOR_CA_CERT}" ]; then
    cp "${HARBOR_CA_CERT}" "${REPORT_DIR}/harbor-ca-cert.pem"
    chmod 600 "${REPORT_DIR}/harbor-ca-cert.pem"
  fi
  printf '%s' "${HARBOR_PASSWORD}" | docker login "${HARBOR_REGISTRY}" \
    --username "${HARBOR_USERNAME}" \
    --password-stdin > "${REPORT_DIR}/docker-login.log" 2> "${REPORT_DIR}/docker-login.err.log"
}

harbor_logout() {
  docker logout "${HARBOR_REGISTRY}" > "${REPORT_DIR}/docker-logout.log" 2>&1 || true
}

mode_push() {
  require_command docker
  [ -s "${IMAGE_LIST}" ] || die "image list not found: ${IMAGE_LIST}; run build-images.sh first"
  [ -d "${SBOM_DIR}" ] || die "SBOM directory not found: ${SBOM_DIR}; run generate-sboms.sh first"
  : > "${DIGEST_MANIFEST}"

  harbor_login
  while IFS= read -r image; do
    [ -n "${image}" ] || continue
    repo="${image%:*}"
    service="${repo##*/}"
    remote_image="$(harbor_image_ref "${service}")"
    cdx="${SBOM_DIR}/${service}.cdx.json"
    spdx="${SBOM_DIR}/${service}.spdx.json"
    [ -f "${cdx}" ] || die "CycloneDX SBOM missing for ${service}: ${cdx}"
    [ -f "${spdx}" ] || die "SPDX SBOM missing for ${service}: ${spdx}"

    run_logged "harbor-tag-${service}" docker tag "${image}" "${remote_image}"
    run_logged "harbor-push-${service}" docker push "${remote_image}"

    digest="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "${remote_image}" | grep "^$(harbor_image_repo "${service}")@" | head -n 1 || true)"
    [ -n "${digest}" ] || die "unable to resolve Harbor digest for ${remote_image}"

    python3 - "${DIGEST_MANIFEST}" "$service" "$remote_image" "$digest" "$cdx" "$spdx" "$(full_commit)" "$(ci_image_tag)" <<'PY'
import datetime as dt
import hashlib
import json
import sys

path, service, image, digest, cdx, spdx, commit, tag = sys.argv[1:]
def sha256(path):
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()
with open(path, "a", encoding="utf-8") as handle:
    handle.write(json.dumps({
        "service": service,
        "harbor_image": image,
        "digest": digest,
        "source_commit": commit,
        "tag": tag,
        "cyclonedx": cdx,
        "spdx": spdx,
        "cyclonedx_sha256": sha256(cdx),
        "spdx_sha256": sha256(spdx),
        "published_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }, sort_keys=True) + "\n")
PY
  done < "${IMAGE_LIST}"
  harbor_logout
  log "PASS: six Harbor digest publications"
}

mode_scan() {
  require_command trivy
  require_digest_manifest
  while IFS='|' read -r service _image digest _cdx; do
    name="$(safe_name "${digest}")"
    run_logged "harbor-trivy-critical-${service}" trivy image \
      --scanners vuln \
      --severity CRITICAL \
      --exit-code 1 \
      --ignorefile "${TRIVY_IGNORE_FILE}" \
      --format json \
      --output "${REPORT_DIR}/post-push-trivy/${name}.critical.json" \
      "${digest}"
    run_logged "harbor-trivy-fixable-high-${service}" trivy image \
      --scanners vuln \
      --severity HIGH \
      --ignore-unfixed \
      --exit-code 1 \
      --ignorefile "${TRIVY_IGNORE_FILE}" \
      --format json \
      --output "${REPORT_DIR}/post-push-trivy/${name}.fixable-high.json" \
      "${digest}"
    run_logged "harbor-trivy-secret-misconfig-${service}" trivy image \
      --image-config-scanners misconfig,secret \
      --severity HIGH,CRITICAL \
      --exit-code 1 \
      --ignorefile "${TRIVY_IGNORE_FILE}" \
      --format sarif \
      --output "${REPORT_DIR}/post-push-trivy/${name}.secret-misconfig.sarif" \
      "${digest}"
    touch "${STATUS_DIR}/${service}.trivy-pass"
  done < <(read_digest_rows)
  log "PASS: six post-push Trivy digest scans"
}

mode_sign() {
  require_command cosign
  require_digest_manifest
  while IFS='|' read -r service _image digest _cdx; do
    run_logged "cosign-sign-${service}" cosign sign --yes --key "${COSIGN_KEY_REF}" "${digest}"
    touch "${STATUS_DIR}/${service}.signed"
  done < <(read_digest_rows)
  log "PASS: six Cosign signatures"
}

mode_attest() {
  require_command cosign
  require_digest_manifest
  while IFS='|' read -r service _image digest cdx; do
    run_logged "cosign-attest-${service}" cosign attest --yes --key "${COSIGN_KEY_REF}" --type cyclonedx --predicate "${cdx}" "${digest}"
    touch "${STATUS_DIR}/${service}.attested"
  done < <(read_digest_rows)
  log "PASS: six SBOM attestations"
}

mode_verify() {
  require_command cosign
  require_digest_manifest
  while IFS='|' read -r service _image digest _cdx; do
    run_logged "cosign-verify-${service}" cosign verify --key "${COSIGN_KEY_REF}" "${digest}"
    run_logged "cosign-verify-attestation-${service}" cosign verify-attestation --key "${COSIGN_KEY_REF}" --type cyclonedx "${digest}"
    touch "${STATUS_DIR}/${service}.signature-verified"
    touch "${STATUS_DIR}/${service}.attestation-verified"
  done < <(read_digest_rows)
  log "PASS: six Cosign signature and attestation verifications"
}

mode_manifest() {
  require_digest_manifest
  python3 "${SCRIPT_DIR}/write-release-manifest.py"
}

case "${MODE}" in
  push) mode_push ;;
  scan) mode_scan ;;
  sign) mode_sign ;;
  attest) mode_attest ;;
  verify) mode_verify ;;
  manifest) mode_manifest ;;
  all)
    mode_push
    mode_scan
    mode_sign
    mode_attest
    mode_verify
    mode_manifest
    ;;
  *)
    die "unknown Harbor publish mode: ${MODE}"
    ;;
esac
