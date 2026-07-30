#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-02-jenkins-preflight"

require_command git
require_command node
require_command npm
require_command docker
require_command python3
require_command trivy
require_command syft
require_command cosign
require_command sha256sum

node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
if [ "${node_major}" != "22" ]; then
  die "Node.js 22 is required; found $(node --version)"
fi

git rev-parse HEAD > "${REPORT_DIR}/git-commit.txt"
git branch --show-current > "${REPORT_DIR}/git-branch.txt" || true
git status --porcelain > "${REPORT_DIR}/git-status.txt"

df -h . > "${REPORT_DIR}/filesystem-capacity.txt"
docker system df > "${REPORT_DIR}/docker-system-df.txt" 2>&1 || true

python3 "${SCRIPT_DIR}/validate-security-exceptions.py"

while IFS= read -r service; do
  kind="$(service_kind "${service}")"
  context="$(service_context "${service}")"
  dockerfile="$(service_dockerfile "${service}")"
  [ -d "${ROOT_DIR}/${context}" ] || die "missing context for ${service}: ${context}"
  [ -f "${ROOT_DIR}/${dockerfile}" ] || die "missing Dockerfile for ${service}: ${dockerfile}"
  printf '%s|%s|%s|%s\n' "${service}" "${kind}" "${context}" "${dockerfile}"
done < <(service_names) > "${REPORT_DIR}/service-map-resolved.txt"

log "PASS: Jenkins EC2 preflight"
