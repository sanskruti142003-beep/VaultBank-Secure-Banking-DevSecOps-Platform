#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" &&
  pwd
)"

# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-09-sbom"

VERSIONS_FILE="${ROOT_DIR}/config/tool-versions.env"

IMAGE_LIST="${IMAGE_LIST:-${ROOT_DIR}/reports/phase-07-build/images.txt}"

SBOM_ROOT="${REPORT_DIR}/sbom"
SYFT_JSON_DIR="${SBOM_ROOT}/syft-json"
CYCLONEDX_DIR="${SBOM_ROOT}/cyclonedx-json"
SPDX_DIR="${SBOM_ROOT}/spdx-json"

MANIFEST_JSONL="${REPORT_DIR}/sbom-manifest.jsonl"
MANIFEST_JSON="${REPORT_DIR}/sbom-manifest.json"
SUMMARY_JSON="${REPORT_DIR}/sbom-summary.json"
SUMMARY_TEXT="${REPORT_DIR}/sbom-summary.txt"
CHECKSUM_FILE="${REPORT_DIR}/sbom-checksums.sha256"
METADATA_FILE="${REPORT_DIR}/sbom-metadata.txt"

require_command docker
require_command syft
require_command python3
require_command sha256sum
require_command sort
require_command grep

[ -f "${VERSIONS_FILE}" ] ||
  die "Missing tool-version policy: ${VERSIONS_FILE}"

[ -s "${IMAGE_LIST}" ] ||
  die \
    "Image list not found: ${IMAGE_LIST}; run build-images.sh first"

# shellcheck disable=SC1090
source "${VERSIONS_FILE}"

SYFT_VERSION="${SYFT_VERSION:-}"

[ -n "${SYFT_VERSION}" ] ||
  die "SYFT_VERSION is missing from ${VERSIONS_FILE}"

INSTALLED_SYFT_VERSION="$(
  syft version |
  awk '
    $1 == "Version:" {
      print $2
      exit
    }
  '
)"

[ -n "${INSTALLED_SYFT_VERSION}" ] ||
  die "Unable to determine installed Syft version"

if [ "${INSTALLED_SYFT_VERSION}" != "${SYFT_VERSION}" ]; then
  die \
    "Installed Syft ${INSTALLED_SYFT_VERSION} does not match policy ${SYFT_VERSION}"
fi

mapfile -t IMAGES < <(
  grep -v '^[[:space:]]*$' "${IMAGE_LIST}"
)

if [ "${#IMAGES[@]}" -ne 6 ]; then
  die \
    "Expected exactly 6 images, found ${#IMAGES[@]}"
fi

UNIQUE_IMAGE_COUNT="$(
  printf '%s\n' "${IMAGES[@]}" |
  sort -u |
  wc -l |
  tr -d '[:space:]'
)"

if [ "${UNIQUE_IMAGE_COUNT}" -ne 6 ]; then
  die "Image list contains duplicate references"
fi

for image in "${IMAGES[@]}"; do
  case "${image}" in
    *:latest)
      die "latest image tag is prohibited: ${image}"
      ;;
  esac

  docker image inspect \
    "${image}" \
    >/dev/null 2>&1 ||
    die "Local Docker image does not exist: ${image}"
done

rm -rf "${SBOM_ROOT}"

mkdir -p \
  "${SYFT_JSON_DIR}" \
  "${CYCLONEDX_DIR}" \
  "${SPDX_DIR}"

: > "${MANIFEST_JSONL}"

rm -f \
  "${MANIFEST_JSON}" \
  "${SUMMARY_JSON}" \
  "${SUMMARY_TEXT}" \
  "${CHECKSUM_FILE}" \
  "${METADATA_FILE}"

SOURCE_COMMIT="$(full_commit)"

log "Starting Syft SBOM generation for six images"

for image in "${IMAGES[@]}"; do
  safe_image_name="$(safe_name "${image}")"

  syft_json="${SYFT_JSON_DIR}/${safe_image_name}.syft.json"

  cyclonedx_json="${CYCLONEDX_DIR}/${safe_image_name}.cdx.json"

  spdx_json="${SPDX_DIR}/${safe_image_name}.spdx.json"

  image_id="$(
    docker image inspect \
      --format '{{.Id}}' \
      "${image}"
  )"

  log "Generating SBOMs for ${image}"

  run_logged \
    "syft-sbom-${safe_image_name}" \
    env \
      SYFT_CHECK_FOR_APP_UPDATE=false \
      SYFT_FORMAT_PRETTY=true \
    syft scan \
      "docker:${image}" \
      --scope squashed \
      --source-name "${image}" \
      --source-version "${SOURCE_COMMIT}" \
      --output "syft-json=${syft_json}" \
      --output "cyclonedx-json=${cyclonedx_json}" \
      --output "spdx-json=${spdx_json}"

  [ -s "${syft_json}" ] ||
    die "Syft JSON was not generated for ${image}"

  [ -s "${cyclonedx_json}" ] ||
    die "CycloneDX JSON was not generated for ${image}"

  [ -s "${spdx_json}" ] ||
    die "SPDX JSON was not generated for ${image}"

  python3 \
    - \
    "${MANIFEST_JSONL}" \
    "${image}" \
    "${image_id}" \
    "${syft_json}" \
    "${cyclonedx_json}" \
    "${spdx_json}" \
    "${SYFT_VERSION}" \
    <<'PY'
import hashlib
import json
import sys
from pathlib import Path

(
    manifest_path,
    image,
    image_id,
    syft_path_value,
    cyclonedx_path_value,
    spdx_path_value,
    expected_syft_version,
) = sys.argv[1:]

syft_path = Path(syft_path_value)
cyclonedx_path = Path(cyclonedx_path_value)
spdx_path = Path(spdx_path_value)


def load_json(path: Path) -> dict:
    try:
        document = json.loads(
            path.read_text(encoding="utf-8")
        )
    except json.JSONDecodeError as error:
        raise SystemExit(
            f"FAIL: invalid JSON in {path}: {error}"
        ) from error

    if not isinstance(document, dict):
        raise SystemExit(
            f"FAIL: expected JSON object in {path}"
        )

    return document


def sha256(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for chunk in iter(
            lambda: handle.read(1024 * 1024),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


syft_document = load_json(syft_path)
cyclonedx_document = load_json(cyclonedx_path)
spdx_document = load_json(spdx_path)

descriptor = syft_document.get("descriptor") or {}
actual_syft_version = str(
    descriptor.get("version") or ""
)

if actual_syft_version != expected_syft_version:
    raise SystemExit(
        "FAIL: Syft JSON version mismatch: "
        f"expected {expected_syft_version}, "
        f"found {actual_syft_version or 'missing'}"
    )

syft_packages = syft_document.get("artifacts")

if not isinstance(syft_packages, list):
    raise SystemExit(
        f"FAIL: Syft artifacts missing for {image}"
    )

if not syft_packages:
    raise SystemExit(
        f"FAIL: Syft found zero packages for {image}"
    )

if cyclonedx_document.get("bomFormat") != "CycloneDX":
    raise SystemExit(
        f"FAIL: invalid CycloneDX bomFormat for {image}"
    )

cyclonedx_spec = str(
    cyclonedx_document.get("specVersion") or ""
)

if not cyclonedx_spec:
    raise SystemExit(
        f"FAIL: CycloneDX specVersion missing for {image}"
    )

cyclonedx_components = cyclonedx_document.get(
    "components"
)

if not isinstance(cyclonedx_components, list):
    raise SystemExit(
        f"FAIL: CycloneDX components missing for {image}"
    )

if not cyclonedx_components:
    raise SystemExit(
        f"FAIL: CycloneDX found zero components for {image}"
    )

spdx_version = str(
    spdx_document.get("spdxVersion") or ""
)

if not spdx_version.startswith("SPDX-"):
    raise SystemExit(
        f"FAIL: invalid SPDX version for {image}"
    )

if spdx_document.get("SPDXID") != "SPDXRef-DOCUMENT":
    raise SystemExit(
        f"FAIL: invalid SPDX document identifier for {image}"
    )

document_namespace = str(
    spdx_document.get("documentNamespace") or ""
)

if not document_namespace:
    raise SystemExit(
        f"FAIL: SPDX document namespace missing for {image}"
    )

spdx_packages = spdx_document.get("packages")

if not isinstance(spdx_packages, list):
    raise SystemExit(
        f"FAIL: SPDX packages missing for {image}"
    )

if not spdx_packages:
    raise SystemExit(
        f"FAIL: SPDX found zero packages for {image}"
    )

row = {
    "image": image,
    "image_id": image_id,
    "syft_version": actual_syft_version,
    "syft_json": {
        "file": str(syft_path),
        "sha256": sha256(syft_path),
        "packages": len(syft_packages),
    },
    "cyclonedx_json": {
        "file": str(cyclonedx_path),
        "sha256": sha256(cyclonedx_path),
        "spec_version": cyclonedx_spec,
        "components": len(cyclonedx_components),
    },
    "spdx_json": {
        "file": str(spdx_path),
        "sha256": sha256(spdx_path),
        "spdx_version": spdx_version,
        "packages": len(spdx_packages),
    },
    "validation_passed": True,
}

with Path(manifest_path).open(
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

print(
    f"PASS: {image} "
    f"syft_packages={len(syft_packages)} "
    f"cyclonedx_components={len(cyclonedx_components)} "
    f"spdx_packages={len(spdx_packages)}"
)
PY
done

python3 \
  - \
  "${MANIFEST_JSONL}" \
  "${MANIFEST_JSON}" \
  "${SUMMARY_JSON}" \
  "${SUMMARY_TEXT}" \
  <<'PY'
import json
import sys
from pathlib import Path

(
    manifest_jsonl_value,
    manifest_json_value,
    summary_json_value,
    summary_text_value,
) = sys.argv[1:]

manifest_jsonl = Path(manifest_jsonl_value)
manifest_json = Path(manifest_json_value)
summary_json = Path(summary_json_value)
summary_text = Path(summary_text_value)

rows = [
    json.loads(line)
    for line in manifest_jsonl.read_text(
        encoding="utf-8"
    ).splitlines()
    if line.strip()
]

if len(rows) != 6:
    raise SystemExit(
        f"FAIL: expected 6 SBOM manifest entries, "
        f"found {len(rows)}"
    )

images = [
    row.get("image")
    for row in rows
]

if len(set(images)) != 6:
    raise SystemExit(
        "FAIL: duplicate images found in SBOM manifest"
    )

if not all(
    row.get("validation_passed") is True
    for row in rows
):
    raise SystemExit(
        "FAIL: one or more SBOM validations failed"
    )

manifest = {
    "images": rows,
}

manifest_json.write_text(
    json.dumps(
        manifest,
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)

summary = {
    "images_processed": 6,
    "syft_json_files": 6,
    "cyclonedx_json_files": 6,
    "spdx_json_files": 6,
    "total_sbom_files": 18,
    "validation_passed": True,
    "totals": {
        "syft_packages": sum(
            row["syft_json"]["packages"]
            for row in rows
        ),
        "cyclonedx_components": sum(
            row["cyclonedx_json"]["components"]
            for row in rows
        ),
        "spdx_packages": sum(
            row["spdx_json"]["packages"]
            for row in rows
        ),
    },
}

summary_json.write_text(
    json.dumps(
        summary,
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)

lines = [
    "Images processed: 6",
    "Syft JSON files: 6",
    "CycloneDX JSON files: 6",
    "SPDX JSON files: 6",
    "Total SBOM files: 18",
    "",
]

for row in rows:
    lines.append(
        f"{row['image']}: "
        f"syft_packages="
        f"{row['syft_json']['packages']} "
        f"cyclonedx_components="
        f"{row['cyclonedx_json']['components']} "
        f"spdx_packages="
        f"{row['spdx_json']['packages']}"
    )

lines.extend(
    [
        "",
        (
            "Total Syft packages: "
            f"{summary['totals']['syft_packages']}"
        ),
        (
            "Total CycloneDX components: "
            f"{summary['totals']['cyclonedx_components']}"
        ),
        (
            "Total SPDX packages: "
            f"{summary['totals']['spdx_packages']}"
        ),
        "Validation passed: true",
    ]
)

summary_text.write_text(
    "\n".join(lines) + "\n",
    encoding="utf-8",
)

print("\n".join(lines))
PY

(
  cd "${REPORT_DIR}"

  find sbom \
    -type f \
    -print0 |
  sort -z |
  xargs -0 sha256sum
) > "${CHECKSUM_FILE}"

printf '%s\n' \
  "syft_version=${INSTALLED_SYFT_VERSION}" \
  "images_processed=6" \
  "syft_json_files=6" \
  "cyclonedx_json_files=6" \
  "spdx_json_files=6" \
  "total_sbom_files=18" \
  "source_commit=${SOURCE_COMMIT}" \
  "source_branch=$(normalized_branch)" \
  "validation_passed=true" \
  > "${METADATA_FILE}"

find "${REPORT_DIR}" \
  -type f \
  -exec chmod 640 {} +

log "PASS: six images produced 18 validated SBOM files"
