#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-07-build"

require_command docker
require_command python3

IMAGE_LIST="${REPORT_DIR}/images.txt"
IMAGE_MANIFEST_JSONL="${REPORT_DIR}/image-manifest.jsonl"
IMAGE_MANIFEST="${REPORT_DIR}/image-manifest.json"

: > "${IMAGE_LIST}"
: > "${IMAGE_MANIFEST_JSONL}"

cd "${ROOT_DIR}"
commit="$(full_commit)"
tag="$(ci_image_tag)"

while IFS= read -r service; do
  kind="$(service_kind "${service}")"
  context="$(service_context "${service}")"
  dockerfile="$(service_dockerfile "${service}")"
  build_arg="$(service_build_arg "${service}")"
  image="$(local_image_ref "${service}")"

  docker_args=(
    build
    --pull
    --file "${ROOT_DIR}/${dockerfile}"
    --label "org.opencontainers.image.source=${GIT_URL:-https://github.com/sonappatil/vault_bank.git}"
    --label "org.opencontainers.image.revision=${commit}"
    --label "org.opencontainers.image.version=${tag}"
    --label "org.opencontainers.image.title=vaultbank-${service}"
    --label "dev.vaultbank.service=${service}"
    --tag "${image}"
  )

  if [ "${kind}" = "backend" ]; then
    [ -n "${build_arg}" ] || die "${service} missing SERVICE_NAME build arg"
    docker_args+=(--build-arg "${build_arg}")
  elif [ "${kind}" = "frontend" ]; then
    docker_args+=(--build-arg "VITE_API_BASE_URL=${VITE_API_BASE_URL:-/api}")
  else
    die "unsupported service kind for ${service}: ${kind}"
  fi

  docker_args+=("${ROOT_DIR}/${context}")
  run_logged "docker-build-${service}" docker "${docker_args[@]}"

  image_id="$(docker image inspect --format '{{.Id}}' "${image}")"
  user="$(docker image inspect --format '{{.Config.User}}' "${image}")"
  [ -n "${user}" ] || die "${service} final image must define a non-root USER"
  [ "${user}" != "root" ] || die "${service} final image must not run as root"

  if docker history --no-trunc "${image}" | grep -Ei '(_SECRET|PASSWORD|TOKEN|PRIVATE KEY|BEGIN .*PRIVATE)' >/dev/null; then
    die "${service} image history may contain secret material"
  fi

  printf '%s\n' "${image}" >> "${IMAGE_LIST}"
  python3 - "$IMAGE_MANIFEST_JSONL" "$service" "$kind" "$image" "$image_id" "$user" "$dockerfile" "$context" "$tag" "$commit" <<'PY'
import json
import sys

path, service, kind, image, image_id, user, dockerfile, context, tag, commit = sys.argv[1:]
with open(path, "a", encoding="utf-8") as handle:
    handle.write(json.dumps({
        "service": service,
        "kind": kind,
        "local_image": image,
        "image_id": image_id,
        "runtime_user": user,
        "dockerfile": dockerfile,
        "context": context,
        "tag": tag,
        "source_commit": commit,
    }, sort_keys=True) + "\n")
PY
done < <(service_names)

python3 - "${IMAGE_MANIFEST_JSONL}" "${IMAGE_MANIFEST}" <<'PY'
import json
import sys

src, dst = sys.argv[1:]
with open(src, "r", encoding="utf-8") as handle:
    rows = [json.loads(line) for line in handle if line.strip()]
if len(rows) != 6:
    raise SystemExit(f"expected 6 images from service map, found {len(rows)}")
with open(dst, "w", encoding="utf-8") as handle:
    json.dump({"images": rows}, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

log "PASS: six deterministic image builds"
