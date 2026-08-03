#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" &&
  pwd
)"

# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-10-harbor-publish"

IMAGE_MANIFEST="${IMAGE_MANIFEST:-${ROOT_DIR}/reports/phase-07-build/image-manifest.json}"

HARBOR_PUBLICATION_MANIFEST="${REPORT_DIR}/harbor-publication-manifest.json"

HARBOR_PUBLICATION_JSONL="${REPORT_DIR}/harbor-publication-manifest.jsonl"

REGISTRY_IMAGES_FILE="${REPORT_DIR}/registry-images.txt"

REGISTRY_DIGESTS_FILE="${REPORT_DIR}/registry-digests.txt"

PUBLICATION_SUMMARY="${REPORT_DIR}/harbor-publication-summary.json"

PUBLICATION_SUMMARY_TEXT="${REPORT_DIR}/harbor-publication-summary.txt"

CHECKSUM_FILE="${REPORT_DIR}/harbor-publication-checksums.sha256"

require_command docker
require_command python3
require_command sha256sum
require_command grep
require_command sed

[ -s "${IMAGE_MANIFEST}" ] ||
  die \
    "Image manifest missing: ${IMAGE_MANIFEST}; run build-images.sh first"

[ -n "${HARBOR_REGISTRY:-}" ] ||
  die "HARBOR_REGISTRY is required"

[ -n "${HARBOR_PROJECT:-}" ] ||
  die "HARBOR_PROJECT is required"

[ -n "${HARBOR_USERNAME:-}" ] ||
  die "HARBOR_USERNAME is required"

[ -n "${HARBOR_PASSWORD:-}" ] ||
  die "HARBOR_PASSWORD is required"

case "${HARBOR_REGISTRY}" in
  http://* | https://* | */*)
    die \
      "HARBOR_REGISTRY must be hostname:port without scheme or path"
    ;;
esac

case "${HARBOR_PROJECT}" in
  *[!a-z0-9._-]* | "")
    die "Invalid Harbor project name: ${HARBOR_PROJECT}"
    ;;
esac

SOURCE_COMMIT="$(full_commit)"

BUILD_IDENTIFIER="${BUILD_NUMBER:-local}"

BUILD_IDENTIFIER="$(
  printf '%s' "${BUILD_IDENTIFIER}" |
  tr '[:upper:]' '[:lower:]' |
  sed -E \
    's/[^a-z0-9_.-]+/-/g; s/^-+//; s/-+$//'
)"

[ -n "${BUILD_IDENTIFIER}" ] ||
  die "Unable to create a valid build identifier"

REGISTRY_TAG="sha-${SOURCE_COMMIT}-b${BUILD_IDENTIFIER}"

if [ "${#REGISTRY_TAG}" -gt 128 ]; then
  die "Registry tag exceeds 128 characters"
fi

rm -rf "${REPORT_DIR}"
mkdir -p "${REPORT_DIR}"

: > "${HARBOR_PUBLICATION_JSONL}"
: > "${REGISTRY_IMAGES_FILE}"
: > "${REGISTRY_DIGESTS_FILE}"

INPUT_TSV="${REPORT_DIR}/publication-input.tsv"

python3 - \
  "${IMAGE_MANIFEST}" \
  "${SOURCE_COMMIT}" \
  "${INPUT_TSV}" \
  <<'PY'
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1])
source_commit = sys.argv[2]
output_path = Path(sys.argv[3])

manifest = json.loads(
    manifest_path.read_text(encoding="utf-8")
)

images = manifest.get("images") or []

expected_services = {
    "auth-service",
    "account-service",
    "transaction-service",
    "payment-service",
    "notification-service",
    "frontend",
}

if len(images) != 6:
    raise SystemExit(
        f"FAIL: expected 6 build-manifest entries, found {len(images)}"
    )

actual_services = {
    image.get("service")
    for image in images
}

if actual_services != expected_services:
    raise SystemExit(
        "FAIL: build-manifest service set does not match policy: "
        f"{sorted(actual_services)}"
    )

lines = []

for image in sorted(
    images,
    key=lambda item: item["service"],
):
    service = image.get("service")
    local_image = image.get("local_image")
    manifest_commit = image.get("source_commit")

    if not local_image:
        raise SystemExit(
            f"FAIL: local image is missing for {service}"
        )

    if manifest_commit != source_commit:
        raise SystemExit(
            f"FAIL: {service} was built from "
            f"{manifest_commit}, current commit is {source_commit}"
        )

    if "\t" in local_image or "\n" in local_image:
        raise SystemExit(
            f"FAIL: invalid local image reference for {service}"
        )

    lines.append(
        f"{service}\t{local_image}"
    )

output_path.write_text(
    "\n".join(lines) + "\n",
    encoding="utf-8",
)

print(
    "PASS: six build-manifest entries match the current commit"
)
PY

INPUT_COUNT="$(
  wc -l < "${INPUT_TSV}" |
  tr -d '[:space:]'
)"

[ "${INPUT_COUNT}" -eq 6 ] ||
  die "Expected 6 publication inputs, found ${INPUT_COUNT}"

DOCKER_CONFIG_DIR="$(
  mktemp -d /tmp/vaultbank-harbor-docker.XXXXXX
)"

chmod 700 "${DOCKER_CONFIG_DIR}"
export DOCKER_CONFIG="${DOCKER_CONFIG_DIR}"

cleanup() {
  docker logout "${HARBOR_REGISTRY}" \
    >/dev/null 2>&1 ||
    true

  rm -rf "${DOCKER_CONFIG_DIR}"

  unset HARBOR_PASSWORD
}

trap cleanup EXIT

log "Authenticating to Harbor using temporary Docker credentials"

set +x

printf '%s' "${HARBOR_PASSWORD}" |
docker login \
  "${HARBOR_REGISTRY}" \
  --username "${HARBOR_USERNAME}" \
  --password-stdin \
  > "${REPORT_DIR}/docker-login.log" \
  2>&1

unset HARBOR_PASSWORD

grep -q 'Login Succeeded' \
  "${REPORT_DIR}/docker-login.log" ||
  die "Harbor Docker login did not report success"

log "PASS: Harbor authentication succeeded"

while IFS=$'\t' read -r service local_image; do
  [ -n "${service}" ] ||
    die "Empty service in publication input"

  [ -n "${local_image}" ] ||
    die "Empty image for ${service}"

  docker image inspect "${local_image}" \
    >/dev/null ||
    die "Local image not found: ${local_image}"

  IMAGE_REVISION="$(
    docker image inspect \
      --format \
      '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
      "${local_image}"
  )"

  IMAGE_SERVICE="$(
    docker image inspect \
      --format \
      '{{ index .Config.Labels "dev.vaultbank.service" }}' \
      "${local_image}"
  )"

  LOCAL_IMAGE_ID="$(
    docker image inspect \
      --format '{{.Id}}' \
      "${local_image}"
  )"

  [ "${IMAGE_REVISION}" = "${SOURCE_COMMIT}" ] ||
    die \
      "${service} image revision ${IMAGE_REVISION} does not match ${SOURCE_COMMIT}"

  [ "${IMAGE_SERVICE}" = "${service}" ] ||
    die \
      "${service} image label identifies ${IMAGE_SERVICE}"

  REGISTRY_REPOSITORY="${HARBOR_REGISTRY}/${HARBOR_PROJECT}/${service}"

  REGISTRY_IMAGE="${REGISTRY_REPOSITORY}:${REGISTRY_TAG}"

  if docker manifest inspect "${REGISTRY_IMAGE}" \
    >/dev/null 2>&1; then

    die \
      "Immutable registry tag already exists: ${REGISTRY_IMAGE}"
  fi

  log "Tagging ${local_image} as ${REGISTRY_IMAGE}"

  docker image tag \
    "${local_image}" \
    "${REGISTRY_IMAGE}"

  PUSH_LOG="${REPORT_DIR}/docker-push-${service}.log"

  log "Pushing ${REGISTRY_IMAGE}"

  docker image push \
    "${REGISTRY_IMAGE}" \
    2>&1 |
  tee "${PUSH_LOG}"

  DIGEST="$(
    grep -Eo \
      'sha256:[0-9a-f]{64}' \
      "${PUSH_LOG}" |
    tail -1 ||
    true
  )"

  [ -n "${DIGEST}" ] ||
    die \
      "Unable to extract registry digest for ${REGISTRY_IMAGE}"

  IMMUTABLE_REFERENCE="${REGISTRY_REPOSITORY}@${DIGEST}"

  log "Verifying remote digest ${IMMUTABLE_REFERENCE}"

  docker manifest inspect \
    "${IMMUTABLE_REFERENCE}" \
    > "${REPORT_DIR}/registry-manifest-${service}.json"

  python3 -m json.tool \
    "${REPORT_DIR}/registry-manifest-${service}.json" \
    >/dev/null

  printf '%s\n' \
    "${REGISTRY_IMAGE}" \
    >> "${REGISTRY_IMAGES_FILE}"

  printf '%s\n' \
    "${IMMUTABLE_REFERENCE}" \
    >> "${REGISTRY_DIGESTS_FILE}"

  python3 - \
    "${HARBOR_PUBLICATION_JSONL}" \
    "${service}" \
    "${local_image}" \
    "${LOCAL_IMAGE_ID}" \
    "${REGISTRY_IMAGE}" \
    "${REGISTRY_TAG}" \
    "${DIGEST}" \
    "${IMMUTABLE_REFERENCE}" \
    "${SOURCE_COMMIT}" \
    <<'PY'
import datetime
import json
import sys
from pathlib import Path

(
    output_path,
    service,
    local_image,
    local_image_id,
    registry_image,
    registry_tag,
    digest,
    immutable_reference,
    source_commit,
) = sys.argv[1:]

row = {
    "service": service,
    "local_image": local_image,
    "local_image_id": local_image_id,
    "registry_image": registry_image,
    "registry_tag": registry_tag,
    "digest": digest,
    "immutable_reference": immutable_reference,
    "source_commit": source_commit,
    "published_at": (
        datetime.datetime.now(
            datetime.timezone.utc
        )
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    ),
}

with Path(output_path).open(
    "a",
    encoding="utf-8",
) as handle:
    handle.write(
        json.dumps(
            row,
            sort_keys=True,
        )
        + "\n"
    )
PY

  log \
    "PASS: ${service} published as ${IMMUTABLE_REFERENCE}"
done < "${INPUT_TSV}"

export \
  HARBOR_PUBLICATION_JSONL \
  HARBOR_PUBLICATION_MANIFEST \
  PUBLICATION_SUMMARY \
  PUBLICATION_SUMMARY_TEXT \
  HARBOR_REGISTRY \
  HARBOR_PROJECT \
  REGISTRY_TAG \
  SOURCE_COMMIT

python3 - <<'PY'
import json
import os
from pathlib import Path

jsonl_path = Path(
    os.environ["HARBOR_PUBLICATION_JSONL"]
)

rows = [
    json.loads(line)
    for line in jsonl_path.read_text(
        encoding="utf-8"
    ).splitlines()
    if line.strip()
]

if len(rows) != 6:
    raise SystemExit(
        f"FAIL: expected 6 published images, found {len(rows)}"
    )

services = {
    row["service"]
    for row in rows
}

if len(services) != 6:
    raise SystemExit(
        "FAIL: duplicate services in publication manifest"
    )

for row in rows:
    digest = row.get("digest", "")

    if not digest.startswith("sha256:"):
        raise SystemExit(
            f"FAIL: invalid digest for {row['service']}"
        )

manifest = {
    "registry": os.environ["HARBOR_REGISTRY"],
    "project": os.environ["HARBOR_PROJECT"],
    "registry_tag": os.environ["REGISTRY_TAG"],
    "source_commit": os.environ["SOURCE_COMMIT"],
    "images_pushed": len(rows),
    "images": rows,
    "validation_passed": True,
}

Path(
    os.environ["HARBOR_PUBLICATION_MANIFEST"]
).write_text(
    json.dumps(
        manifest,
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)

summary = {
    "registry": manifest["registry"],
    "project": manifest["project"],
    "registry_tag": manifest["registry_tag"],
    "source_commit": manifest["source_commit"],
    "images_pushed": 6,
    "digests_captured": 6,
    "immutable_tag_pattern": "sha-*",
    "validation_passed": True,
}

Path(
    os.environ["PUBLICATION_SUMMARY"]
).write_text(
    json.dumps(
        summary,
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)

summary_lines = [
    f"Registry: {summary['registry']}",
    f"Project: {summary['project']}",
    f"Registry tag: {summary['registry_tag']}",
    f"Source commit: {summary['source_commit']}",
    "Images pushed: 6",
    "Digests captured: 6",
    "Immutable tag pattern: sha-*",
    "Validation passed: true",
]

Path(
    os.environ["PUBLICATION_SUMMARY_TEXT"]
).write_text(
    "\n".join(summary_lines) + "\n",
    encoding="utf-8",
)

print("\n".join(summary_lines))
PY

REGISTRY_IMAGE_COUNT="$(
  wc -l < "${REGISTRY_IMAGES_FILE}" |
  tr -d '[:space:]'
)"

REGISTRY_DIGEST_COUNT="$(
  wc -l < "${REGISTRY_DIGESTS_FILE}" |
  tr -d '[:space:]'
)"

[ "${REGISTRY_IMAGE_COUNT}" -eq 6 ] ||
  die "Expected 6 registry image tags"

[ "${REGISTRY_DIGEST_COUNT}" -eq 6 ] ||
  die "Expected 6 immutable digest references"

if grep -Eq ':latest$' \
  "${REGISTRY_IMAGES_FILE}"; then

  die "The latest tag is prohibited"
fi

(
  cd "${REPORT_DIR}"

  sha256sum \
    harbor-publication-manifest.json \
    harbor-publication-summary.json \
    registry-images.txt \
    registry-digests.txt \
    > "${CHECKSUM_FILE}"

  sha256sum \
    --check \
    "${CHECKSUM_FILE}"
)

find "${REPORT_DIR}" \
  -type f \
  -exec chmod 640 {} +

log "PASS: six images published and registry digests captured"
