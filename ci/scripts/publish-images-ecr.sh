#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

require_command aws
require_command docker

IMAGE_LIST="${IMAGE_LIST:-${REPORT_DIR}/images.txt}"
[ -s "${IMAGE_LIST}" ] || die "image list not found: ${IMAGE_LIST}; run build-images.sh first"

registry="$(ecr_registry)"
aws ecr get-login-password --region "${AWS_REGION}" |
  docker login --username AWS --password-stdin "${registry}" \
    > "${REPORT_DIR}/ecr-login.log" 2> "${REPORT_DIR}/ecr-login.err.log"

while IFS= read -r image; do
  [ -n "${image}" ] || continue
  repository="${image#${registry}/}"
  repository="${repository%:${IMAGE_TAG}}"
  aws ecr describe-repositories --region "${AWS_REGION}" --repository-names "${repository}" \
    > "${REPORT_DIR}/ecr-${repository//\//_}-describe.json" 2>/dev/null ||
    aws ecr create-repository \
      --region "${AWS_REGION}" \
      --repository-name "${repository}" \
      --image-scanning-configuration scanOnPush=true \
      --encryption-configuration encryptionType=AES256 \
      > "${REPORT_DIR}/ecr-${repository//\//_}-create.json"

  run_logged "docker-push-${repository//\//_}" docker push "${image}"
  digest="$(docker inspect --format='{{index .RepoDigests 0}}' "${image}" 2>/dev/null || true)"
  if [ -n "${digest}" ]; then
    printf '%s\n' "${digest}" >> "${REPORT_DIR}/image-digests.txt"
  fi
done < "${IMAGE_LIST}"

log "PASS: Amazon ECR push"
