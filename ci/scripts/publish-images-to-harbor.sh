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

HARBOR_AUTO_SBOM_JSONL="${REPORT_DIR}/harbor-auto-sbom.jsonl"

REGISTRY_IMAGES_FILE="${REPORT_DIR}/registry-images.txt"

REGISTRY_DIGESTS_FILE="${REPORT_DIR}/registry-digests.txt"

PUBLICATION_SUMMARY="${REPORT_DIR}/harbor-publication-summary.json"

PUBLICATION_SUMMARY_TEXT="${REPORT_DIR}/harbor-publication-summary.txt"

CHECKSUM_FILE="${REPORT_DIR}/harbor-publication-checksums.sha256"

HARBOR_AUTO_SBOM_REQUIRED="${HARBOR_AUTO_SBOM_REQUIRED:-1}"

HARBOR_ENSURE_AUTO_SBOM_ENABLED="${HARBOR_ENSURE_AUTO_SBOM_ENABLED:-0}"

HARBOR_AUTO_SBOM_TIMEOUT_SECONDS="${HARBOR_AUTO_SBOM_TIMEOUT_SECONDS:-900}"

HARBOR_AUTO_SBOM_POLL_SECONDS="${HARBOR_AUTO_SBOM_POLL_SECONDS:-15}"

HARBOR_SCHEME="${HARBOR_SCHEME:-https}"

HARBOR_TLS_VERIFY="${HARBOR_TLS_VERIFY:-1}"

REGISTRY_CA="${REGISTRY_CA:-/usr/local/share/ca-certificates/vaultbank-harbor-ca.crt}"

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

case "${HARBOR_AUTO_SBOM_REQUIRED}" in
  0 | 1)
    ;;
  *)
    die "HARBOR_AUTO_SBOM_REQUIRED must be 0 or 1"
    ;;
esac

case "${HARBOR_ENSURE_AUTO_SBOM_ENABLED}" in
  0 | 1)
    ;;
  *)
    die "HARBOR_ENSURE_AUTO_SBOM_ENABLED must be 0 or 1"
    ;;
esac

if [ "${HARBOR_AUTO_SBOM_REQUIRED}" = "1" ]; then
  require_command curl

  case "${HARBOR_AUTO_SBOM_TIMEOUT_SECONDS}" in
    *[!0-9]* | "")
      die "HARBOR_AUTO_SBOM_TIMEOUT_SECONDS must be a positive integer"
      ;;
  esac

  case "${HARBOR_AUTO_SBOM_POLL_SECONDS}" in
    *[!0-9]* | "")
      die "HARBOR_AUTO_SBOM_POLL_SECONDS must be a positive integer"
      ;;
  esac

  [ "${HARBOR_AUTO_SBOM_TIMEOUT_SECONDS}" -gt 0 ] ||
    die "HARBOR_AUTO_SBOM_TIMEOUT_SECONDS must be greater than zero"

  [ "${HARBOR_AUTO_SBOM_POLL_SECONDS}" -gt 0 ] ||
    die "HARBOR_AUTO_SBOM_POLL_SECONDS must be greater than zero"

  if [ "${HARBOR_TLS_VERIFY}" = "1" ]; then
    [ -r "${REGISTRY_CA}" ] ||
      die "Harbor CA is not readable: ${REGISTRY_CA}"
  fi
fi

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
: > "${HARBOR_AUTO_SBOM_JSONL}"
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

HARBOR_NETRC_FILE=""

chmod 700 "${DOCKER_CONFIG_DIR}"
export DOCKER_CONFIG="${DOCKER_CONFIG_DIR}"

cleanup() {
  docker logout "${HARBOR_REGISTRY}" \
    >/dev/null 2>&1 ||
    true

  rm -rf "${DOCKER_CONFIG_DIR}"

  if [ -n "${HARBOR_NETRC_FILE}" ]; then
    rm -f "${HARBOR_NETRC_FILE}"
  fi

  unset HARBOR_PASSWORD
}

trap cleanup EXIT

url_encode() {
  python3 -c \
    'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' \
    "$1"
}

harbor_api_url() {
  local path="$1"
  printf '%s://%s/api/v2.0/%s\n' \
    "${HARBOR_SCHEME}" \
    "${HARBOR_REGISTRY}" \
    "${path}"
}

harbor_curl_args() {
  if [ "${HARBOR_TLS_VERIFY}" = "1" ]; then
    printf '%s\0%s\0' --cacert "${REGISTRY_CA}"
  else
    printf '%s\0' --insecure
  fi
}

harbor_api_get() {
  local output_file="$1"
  local url="$2"
  shift 2

  local -a tls_args=()
  mapfile -d '' -t tls_args < <(harbor_curl_args)

  curl \
    --fail \
    --silent \
    --show-error \
    "${tls_args[@]}" \
    --netrc-file "${HARBOR_NETRC_FILE}" \
    --get \
    "${url}" \
    "$@" \
    --output "${output_file}"
}

harbor_api_put_json() {
  local output_file="$1"
  local url="$2"
  local payload="$3"

  local -a tls_args=()
  mapfile -d '' -t tls_args < <(harbor_curl_args)

  curl \
    --fail \
    --silent \
    --show-error \
    "${tls_args[@]}" \
    --netrc-file "${HARBOR_NETRC_FILE}" \
    --request PUT \
    --header 'Content-Type: application/json' \
    --data "${payload}" \
    "${url}" \
    --output "${output_file}"
}

setup_harbor_api_credentials() {
  if [ "${HARBOR_AUTO_SBOM_REQUIRED}" != "1" ]; then
    return 0
  fi

  HARBOR_NETRC_FILE="$(
    mktemp /tmp/vaultbank-harbor-netrc.XXXXXX
  )"

  chmod 600 "${HARBOR_NETRC_FILE}"

  printf 'machine %s login %s password %s\n' \
    "${HARBOR_REGISTRY%%:*}" \
    "${HARBOR_USERNAME}" \
    "${HARBOR_PASSWORD}" \
    > "${HARBOR_NETRC_FILE}"
}

ensure_harbor_auto_sbom_enabled() {
  if [ "${HARBOR_AUTO_SBOM_REQUIRED}" != "1" ]; then
    log "Harbor automatic SBOM gate is disabled"
    return 0
  fi

  if [ "${HARBOR_ENSURE_AUTO_SBOM_ENABLED}" != "1" ]; then
    log "Skipping Harbor project metadata update because HARBOR_ENSURE_AUTO_SBOM_ENABLED=${HARBOR_ENSURE_AUTO_SBOM_ENABLED}"
    log "Harbor automatic SBOM will be validated from the pushed artifact status"
    return 0
  fi

  local project_encoded
  local metadata_url
  local project_url
  local metadata_file
  local update_file

  project_encoded="$(url_encode "${HARBOR_PROJECT}")"
  metadata_url="$(
    harbor_api_url "projects/${project_encoded}/metadatas/"
  )"
  project_url="$(
    harbor_api_url "projects/${project_encoded}"
  )"
  metadata_file="${REPORT_DIR}/harbor-project-metadata.json"
  update_file="${REPORT_DIR}/harbor-project-auto-sbom-update.json"

  log "Ensuring Harbor automatic SBOM generation is enabled"

  harbor_api_get \
    "${metadata_file}" \
    "${metadata_url}" ||
    die "Unable to read Harbor project metadata. Grant the Harbor credential Read Project Metadata."

  if python3 - "${metadata_file}" <<'PY'
import json
import sys

metadata = json.loads(open(sys.argv[1], encoding="utf-8").read())
value = str(metadata.get("auto_sbom_generation", "")).lower()
raise SystemExit(0 if value == "true" else 1)
PY
  then
    log "PASS: Harbor automatic SBOM generation is already enabled"
    return 0
  fi

  log "Enabling Harbor automatic SBOM generation for ${HARBOR_PROJECT}"

  harbor_api_put_json \
    "${update_file}" \
    "${project_url}" \
    '{"metadata":{"auto_sbom_generation":"true"}}' ||
    die "Unable to enable Harbor automatic SBOM generation. Grant the Harbor credential Update Project Metadata, or enable Project > Configuration > SBOM generation in Harbor."

  harbor_api_get \
    "${metadata_file}" \
    "${metadata_url}" ||
    die "Unable to verify Harbor project metadata after enabling SBOM generation"

  python3 - "${metadata_file}" <<'PY'
import json
import sys

metadata = json.loads(open(sys.argv[1], encoding="utf-8").read())
value = str(metadata.get("auto_sbom_generation", "")).lower()
if value != "true":
    raise SystemExit("FAIL: Harbor auto_sbom_generation is not true after update")
PY

  log "PASS: Harbor automatic SBOM generation is enabled"
}

wait_for_harbor_auto_sbom() {
  local service="$1"
  local digest="$2"

  if [ "${HARBOR_AUTO_SBOM_REQUIRED}" != "1" ]; then
    return 0
  fi

  local project_encoded
  local repository_encoded
  local digest_encoded
  local artifact_url
  local artifact_file
  local service_result
  local deadline
  local now
  local parse_output
  local parse_rc

  project_encoded="$(url_encode "${HARBOR_PROJECT}")"
  repository_encoded="$(url_encode "${service}")"
  digest_encoded="$(url_encode "${digest}")"
  artifact_url="$(
    harbor_api_url \
      "projects/${project_encoded}/repositories/${repository_encoded}/artifacts/${digest_encoded}"
  )"
  artifact_file="${REPORT_DIR}/harbor-auto-sbom-${service}.json"
  service_result="${REPORT_DIR}/harbor-auto-sbom-result-${service}.json"
  deadline=$((SECONDS + HARBOR_AUTO_SBOM_TIMEOUT_SECONDS))

  log "Waiting for Harbor automatic SBOM for ${service}@${digest}"

  while true; do
    harbor_api_get \
      "${artifact_file}" \
      "${artifact_url}" \
      --data-urlencode 'with_sbom_overview=true' \
      --data-urlencode 'with_accessory=true' ||
      die "Unable to read Harbor artifact ${service}@${digest}"

    set +e
    parse_output="$(
      python3 - \
        "${artifact_file}" \
        "${service_result}" \
        "${service}" \
        "${digest}" \
        "${HARBOR_AUTO_SBOM_JSONL}" <<'PY'
import json
import sys
from pathlib import Path

artifact_path = Path(sys.argv[1])
result_path = Path(sys.argv[2])
service = sys.argv[3]
digest = sys.argv[4]
jsonl_path = Path(sys.argv[5])

artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
overview = artifact.get("sbom_overview") or {}
status = str(overview.get("scan_status") or "").strip()
status_lower = status.lower()
sbom_digest = str(overview.get("sbom_digest") or "")
report_id = str(overview.get("report_id") or "")

result = {
    "service": service,
    "digest": digest,
    "scan_status": status,
    "sbom_digest": sbom_digest,
    "report_id": report_id,
}

if status_lower == "success" and sbom_digest and report_id:
    result["validation_passed"] = True
    result_path.write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    with jsonl_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(result, sort_keys=True) + "\n")
    print(f"success {sbom_digest} {report_id}")
    raise SystemExit(0)

if status_lower in {"error", "failed", "failure", "stopped", "stop"}:
    result["validation_passed"] = False
    result_path.write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"failed {status or 'empty'}")
    raise SystemExit(2)

print(f"pending {status or 'empty'}")
raise SystemExit(1)
PY
    )"
    parse_rc=$?
    set -e

    case "${parse_rc}" in
      0)
        log "PASS: Harbor automatic SBOM ready for ${service}: ${parse_output}"
        return 0
        ;;
      2)
        die "Harbor automatic SBOM failed for ${service}: ${parse_output}"
        ;;
    esac

    now="${SECONDS}"

    if [ "${now}" -ge "${deadline}" ]; then
      die "Timed out waiting for Harbor automatic SBOM for ${service}: ${parse_output}"
    fi

    log "Harbor automatic SBOM pending for ${service}: ${parse_output}"
    sleep "${HARBOR_AUTO_SBOM_POLL_SECONDS}"
  done
}

setup_harbor_api_credentials

ensure_harbor_auto_sbom_enabled

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

  wait_for_harbor_auto_sbom \
    "${service}" \
    "${DIGEST}"

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
  HARBOR_AUTO_SBOM_JSONL \
  HARBOR_PUBLICATION_MANIFEST \
  PUBLICATION_SUMMARY \
  PUBLICATION_SUMMARY_TEXT \
  HARBOR_REGISTRY \
  HARBOR_PROJECT \
  REGISTRY_TAG \
  SOURCE_COMMIT \
  HARBOR_AUTO_SBOM_REQUIRED

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

auto_sbom_required = os.environ.get(
    "HARBOR_AUTO_SBOM_REQUIRED",
    "1",
) == "1"

sbom_rows = []
sbom_path = Path(
    os.environ["HARBOR_AUTO_SBOM_JSONL"]
)

if sbom_path.exists():
    sbom_rows = [
        json.loads(line)
        for line in sbom_path.read_text(
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

if auto_sbom_required:
    if len(sbom_rows) != 6:
        raise SystemExit(
            f"FAIL: expected 6 Harbor automatic SBOM results, found {len(sbom_rows)}"
        )

    sbom_services = {
        row.get("service")
        for row in sbom_rows
    }

    if sbom_services != services:
        raise SystemExit(
            "FAIL: Harbor automatic SBOM service set does not match published services"
        )

    for row in sbom_rows:
        if row.get("validation_passed") is not True:
            raise SystemExit(
                f"FAIL: Harbor automatic SBOM was not validated for {row.get('service')}"
            )
        if str(row.get("scan_status", "")).lower() != "success":
            raise SystemExit(
                f"FAIL: Harbor automatic SBOM status is not Success for {row.get('service')}"
            )
        if not str(row.get("sbom_digest", "")).startswith("sha256:"):
            raise SystemExit(
                f"FAIL: Harbor automatic SBOM digest is invalid for {row.get('service')}"
            )
        if not str(row.get("report_id", "")):
            raise SystemExit(
                f"FAIL: Harbor automatic SBOM report id is missing for {row.get('service')}"
            )

manifest = {
    "registry": os.environ["HARBOR_REGISTRY"],
    "project": os.environ["HARBOR_PROJECT"],
    "registry_tag": os.environ["REGISTRY_TAG"],
    "source_commit": os.environ["SOURCE_COMMIT"],
    "images_pushed": len(rows),
    "images": rows,
    "harbor_auto_sbom_required": auto_sbom_required,
    "harbor_auto_sboms": sbom_rows,
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
    "harbor_auto_sboms": len(sbom_rows),
    "harbor_auto_sbom_required": auto_sbom_required,
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
    f"Harbor automatic SBOM required: {str(auto_sbom_required).lower()}",
    f"Harbor automatic SBOMs: {len(sbom_rows)}",
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
