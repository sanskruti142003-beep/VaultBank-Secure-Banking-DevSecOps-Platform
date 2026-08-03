#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" &&
  pwd
)"

# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-12-cosign-oci"

VERSIONS_FILE="${ROOT_DIR}/config/tool-versions.env"

PUBLICATION_MANIFEST="${PUBLICATION_MANIFEST:-${ROOT_DIR}/reports/phase-10-harbor-publish/harbor-publication-manifest.json}"

TRIVY_SUMMARY="${TRIVY_SUMMARY:-${ROOT_DIR}/reports/phase-11-trivy-registry/trivy-registry-summary.json}"

SBOM_SEARCH_ROOT="${SBOM_SEARCH_ROOT:-${ROOT_DIR}/reports}"

REGISTRY_CA="${REGISTRY_CA:-/usr/local/share/ca-certificates/vaultbank-harbor-ca.crt}"

SIGNING_INPUT="${REPORT_DIR}/cosign-signing-input.tsv"
PUBLIC_KEY="${REPORT_DIR}/cosign-kms-public-key.pem"
RESULTS_JSONL="${REPORT_DIR}/cosign-oci-results.jsonl"

SUMMARY_JSON="${REPORT_DIR}/cosign-oci-summary.json"
SUMMARY_TEXT="${REPORT_DIR}/cosign-oci-summary.txt"
CHECKSUM_FILE="${REPORT_DIR}/cosign-oci-checksums.sha256"

require_command aws
require_command cosign
require_command docker
require_command openssl
require_command python3
require_command sha256sum
require_command mktemp
require_command find
require_command sort
require_command xargs
require_command awk

[ -f "${VERSIONS_FILE}" ] ||
  die "Missing tool-version policy: ${VERSIONS_FILE}"

PIPELINE_HARBOR_PROJECT="${HARBOR_PROJECT:-}"

# shellcheck disable=SC1090
source "${VERSIONS_FILE}"

POLICY_HARBOR_PROJECT="${HARBOR_PROJECT:-}"

if [ -n "${PIPELINE_HARBOR_PROJECT}" ] &&
   [ -n "${POLICY_HARBOR_PROJECT}" ] &&
   [ "${PIPELINE_HARBOR_PROJECT}" != "${POLICY_HARBOR_PROJECT}" ]; then

  die     "Harbor project mismatch: pipeline=${PIPELINE_HARBOR_PROJECT}, policy=${POLICY_HARBOR_PROJECT}"
fi

HARBOR_PROJECT="${PIPELINE_HARBOR_PROJECT:-${POLICY_HARBOR_PROJECT}}"

[ -n "${COSIGN_VERSION:-}" ] ||
  die "COSIGN_VERSION is missing from ${VERSIONS_FILE}"

[ -n "${COSIGN_KEY_REF:-}" ] ||
  die "COSIGN_KEY_REF is missing from ${VERSIONS_FILE}"

[ -n "${HARBOR_REGISTRY:-}" ] ||
  die "HARBOR_REGISTRY is required"

[ -n "${HARBOR_PROJECT:-}" ] ||
  die "HARBOR_PROJECT is required"

[ -n "${HARBOR_USERNAME:-}" ] ||
  die "HARBOR_USERNAME is required"

[ -n "${HARBOR_PASSWORD:-}" ] ||
  die "HARBOR_PASSWORD is required"

[ -n "${AWS_REGION:-${AWS_DEFAULT_REGION:-}}" ] ||
  die "AWS_REGION or AWS_DEFAULT_REGION is required"

[ -s "${PUBLICATION_MANIFEST}" ] ||
  die \
    "Harbor publication manifest missing: ${PUBLICATION_MANIFEST}"

[ -s "${TRIVY_SUMMARY}" ] ||
  die \
    "Trivy registry summary missing: ${TRIVY_SUMMARY}"

[ -d "${SBOM_SEARCH_ROOT}" ] ||
  die "SBOM search root missing: ${SBOM_SEARCH_ROOT}"

[ -r "${REGISTRY_CA}" ] ||
  die "Harbor registry CA is not readable: ${REGISTRY_CA}"

case "${COSIGN_KEY_REF}" in
  awskms:///*)
    ;;
  *)
    die \
      "Expected AWS KMS Cosign key reference, found ${COSIGN_KEY_REF}"
    ;;
esac

case "${HARBOR_REGISTRY}" in
  http://* | https://* | */*)
    die \
      "HARBOR_REGISTRY must be hostname:port without scheme or path"
    ;;
esac

AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION}}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION}}"

export AWS_REGION
export AWS_DEFAULT_REGION
export AWS_EC2_METADATA_DISABLED=false

ACTUAL_COSIGN_VERSION="$(
  cosign version |
  awk '
    $1 == "GitVersion:" {
      version = $2
      sub(/^v/, "", version)
      print version
      exit
    }
  '
)"

[ -n "${ACTUAL_COSIGN_VERSION}" ] ||
  die "Unable to determine installed Cosign version"

[ "${ACTUAL_COSIGN_VERSION}" = "${COSIGN_VERSION}" ] ||
  die \
    "Installed Cosign ${ACTUAL_COSIGN_VERSION} does not match policy ${COSIGN_VERSION}"

SOURCE_COMMIT="$(full_commit)"

rm -rf "${REPORT_DIR}"
mkdir -p "${REPORT_DIR}"

: > "${RESULTS_JSONL}"

python3 - \
  "${PUBLICATION_MANIFEST}" \
  "${TRIVY_SUMMARY}" \
  "${SBOM_SEARCH_ROOT}" \
  "${SIGNING_INPUT}" \
  "${HARBOR_REGISTRY}" \
  "${HARBOR_PROJECT}" \
  "${SOURCE_COMMIT}" \
  <<'PY'
import hashlib
import json
import re
import sys
from pathlib import Path

(
    publication_path_value,
    trivy_path_value,
    sbom_root_value,
    output_path_value,
    registry,
    project,
    source_commit,
) = sys.argv[1:]

publication_path = Path(publication_path_value)
trivy_path = Path(trivy_path_value)
sbom_root = Path(sbom_root_value)
output_path = Path(output_path_value)

publication = json.loads(
    publication_path.read_text(encoding="utf-8")
)

trivy_summary = json.loads(
    trivy_path.read_text(encoding="utf-8")
)

expected_services = {
    "auth-service",
    "account-service",
    "transaction-service",
    "payment-service",
    "notification-service",
    "frontend",
}

if publication.get("registry") != registry:
    raise SystemExit(
        "FAIL: publication registry does not match policy"
    )

if publication.get("project") != project:
    raise SystemExit(
        "FAIL: publication project does not match policy"
    )

if publication.get("source_commit") != source_commit:
    raise SystemExit(
        "FAIL: publication source commit does not match "
        "the current pipeline commit"
    )

if publication.get("images_pushed") != 6:
    raise SystemExit(
        "FAIL: publication manifest does not report 6 images"
    )

if publication.get("validation_passed") is not True:
    raise SystemExit(
        "FAIL: Harbor publication validation is not true"
    )

if trivy_summary.get("source_commit") != source_commit:
    raise SystemExit(
        "FAIL: Trivy summary source commit does not match"
    )

if trivy_summary.get("images_scanned") != 6:
    raise SystemExit(
        "FAIL: Trivy summary does not report 6 images"
    )

if trivy_summary.get("validation_passed") is not True:
    raise SystemExit(
        "FAIL: Trivy Harbor digest gate did not pass"
    )

for field in (
    "critical_vulnerabilities",
    "fixable_high_vulnerabilities",
    "secret_findings",
    "misconfiguration_findings",
):
    if trivy_summary.get(field) != 0:
        raise SystemExit(
            f"FAIL: Trivy security field is non-zero: {field}"
        )

images = publication.get("images") or []

if len(images) != 6:
    raise SystemExit(
        f"FAIL: expected 6 publication entries, found {len(images)}"
    )

actual_services = {
    image.get("service")
    for image in images
}

if actual_services != expected_services:
    raise SystemExit(
        "FAIL: publication service set does not match policy"
    )

reference_pattern = re.compile(
    rf"^{re.escape(registry)}/"
    rf"{re.escape(project)}/"
    r"[a-z0-9._-]+@sha256:[0-9a-f]{64}$"
)

sbom_candidates = sorted(
    sbom_root.rglob("*.spdx.json")
)

lines = []
matched_sboms = set()
references = set()

for image in sorted(
    images,
    key=lambda item: item["service"],
):
    service = image.get("service", "")
    reference = image.get("immutable_reference", "")

    if not reference_pattern.fullmatch(reference):
        raise SystemExit(
            f"FAIL: invalid immutable reference for {service}: "
            f"{reference}"
        )

    matches = [
        path
        for path in sbom_candidates
        if service in path.name
    ]

    if len(matches) != 1:
        raise SystemExit(
            f"FAIL: expected exactly one SPDX SBOM for "
            f"{service}, found {len(matches)}"
        )

    sbom_path = matches[0]

    sbom = json.loads(
        sbom_path.read_text(encoding="utf-8")
    )

    spdx_version = str(
        sbom.get("spdxVersion") or ""
    )

    if not spdx_version.startswith("SPDX-"):
        raise SystemExit(
            f"FAIL: invalid SPDX version for {service}"
        )

    if sbom.get("SPDXID") != "SPDXRef-DOCUMENT":
        raise SystemExit(
            f"FAIL: invalid SPDX document ID for {service}"
        )

    sbom_sha256 = hashlib.sha256(
        sbom_path.read_bytes()
    ).hexdigest()

    if "\t" in str(sbom_path):
        raise SystemExit(
            f"FAIL: unsafe SBOM path for {service}"
        )

    matched_sboms.add(str(sbom_path))
    references.add(reference)

    lines.append(
        "\t".join(
            (
                service,
                reference,
                str(sbom_path),
                sbom_sha256,
            )
        )
    )

if len(matched_sboms) != 6:
    raise SystemExit(
        "FAIL: SPDX SBOM mappings are not unique"
    )

if len(references) != 6:
    raise SystemExit(
        "FAIL: Harbor image references are not unique"
    )

output_path.write_text(
    "\n".join(lines) + "\n",
    encoding="utf-8",
)

print(
    "PASS: six Trivy-approved digests and "
    "six SPDX SBOMs validated"
)
PY

INPUT_COUNT="$(
  wc -l < "${SIGNING_INPUT}" |
  tr -d '[:space:]'
)"

[ "${INPUT_COUNT}" -eq 6 ] ||
  die "Expected 6 Cosign inputs, found ${INPUT_COUNT}"

DOCKER_CONFIG_DIR="$(
  mktemp -d /tmp/vaultbank-cosign-registry.XXXXXX
)"

CHECKSUM_TMP=""

cleanup() {
  docker logout "${HARBOR_REGISTRY}" \
    >/dev/null 2>&1 ||
    true

  rm -rf "${DOCKER_CONFIG_DIR}"

  if [ -n "${CHECKSUM_TMP}" ]; then
    rm -f "${CHECKSUM_TMP}"
  fi

  unset HARBOR_PASSWORD
}

trap cleanup EXIT

chmod 700 "${DOCKER_CONFIG_DIR}"
export DOCKER_CONFIG="${DOCKER_CONFIG_DIR}"

log "Authenticating Cosign to Harbor"

set +x

printf '%s' "${HARBOR_PASSWORD}" |
docker login \
  "${HARBOR_REGISTRY}" \
  --username "${HARBOR_USERNAME}" \
  --password-stdin \
  > "${REPORT_DIR}/registry-login.log" \
  2>&1

unset HARBOR_PASSWORD

grep -q 'Login Succeeded' \
  "${REPORT_DIR}/registry-login.log" ||
  die "Harbor registry login did not report success"

log "PASS: Cosign Harbor authentication succeeded"

log "Exporting AWS KMS public key"

cosign public-key \
  --key "${COSIGN_KEY_REF}" \
  > "${PUBLIC_KEY}"

[ -s "${PUBLIC_KEY}" ] ||
  die "AWS KMS public key was not exported"

openssl pkey \
  -pubin \
  -in "${PUBLIC_KEY}" \
  -noout \
  >/dev/null

KMS_KEY_ARN="$(
  aws kms describe-key \
    --region "${AWS_REGION}" \
    --key-id "${COSIGN_KEY_REF#awskms:///}" \
    --query 'KeyMetadata.Arn' \
    --output text
)"

[ -n "${KMS_KEY_ARN}" ] ||
  die "Unable to resolve the AWS KMS key ARN"

while IFS=$'\t' read -r \
  service \
  immutable_reference \
  sbom_path \
  sbom_sha256
do
  [ -n "${service}" ] ||
    die "Empty service in Cosign input"

  [ -n "${immutable_reference}" ] ||
    die "Empty digest reference for ${service}"

  [ -s "${sbom_path}" ] ||
    die "SPDX SBOM missing for ${service}: ${sbom_path}"

  SIGN_LOG="${REPORT_DIR}/cosign-sign-${service}.log"
  SIGN_VERIFY_JSON="${REPORT_DIR}/cosign-signature-verification-${service}.json"
  SIGN_VERIFY_LOG="${REPORT_DIR}/cosign-signature-verification-${service}.log"

  ATTEST_LOG="${REPORT_DIR}/cosign-attest-${service}.log"
  ATTEST_VERIFY_JSON="${REPORT_DIR}/cosign-attestation-verification-${service}.json"
  ATTEST_VERIFY_LOG="${REPORT_DIR}/cosign-attestation-verification-${service}.log"

  SERVICE_RESULT="${REPORT_DIR}/cosign-result-${service}.json"

  log "Signing Harbor digest for ${service}"

  cosign sign \
    --yes \
    --use-signing-config=false \
    --tlog-upload=false \
    --key "${COSIGN_KEY_REF}" \
    --registry-cacert "${REGISTRY_CA}" \
    --annotations "service=${service}" \
    --annotations "source_commit=${SOURCE_COMMIT}" \
    --annotations "sbom_sha256=${sbom_sha256}" \
    "${immutable_reference}" \
    > "${SIGN_LOG}" \
    2>&1

  log "Verifying image signature for ${service}"

  cosign verify \
    --key "${PUBLIC_KEY}" \
    --insecure-ignore-tlog \
    --registry-cacert "${REGISTRY_CA}" \
    --annotations "service=${service}" \
    --annotations "source_commit=${SOURCE_COMMIT}" \
    --annotations "sbom_sha256=${sbom_sha256}" \
    --output json \
    "${immutable_reference}" \
    > "${SIGN_VERIFY_JSON}" \
    2> "${SIGN_VERIFY_LOG}"

  [ -s "${SIGN_VERIFY_JSON}" ] ||
    die "Signature verification output is empty for ${service}"

  log "Attaching SPDX SBOM attestation for ${service}"

  cosign attest \
    --yes \
    --use-signing-config=false \
    --key "${COSIGN_KEY_REF}" \
    --predicate "${sbom_path}" \
    --type spdxjson \
    --registry-cacert "${REGISTRY_CA}" \
    "${immutable_reference}" \
    > "${ATTEST_LOG}" \
    2>&1

  log "Verifying SPDX SBOM attestation for ${service}"

  cosign verify-attestation \
    --key "${PUBLIC_KEY}" \
    --insecure-ignore-tlog \
    --registry-cacert "${REGISTRY_CA}" \
    --type spdxjson \
    --output json \
    "${immutable_reference}" \
    > "${ATTEST_VERIFY_JSON}" \
    2> "${ATTEST_VERIFY_LOG}"

  [ -s "${ATTEST_VERIFY_JSON}" ] ||
    die "Attestation verification output is empty for ${service}"

  python3 - \
    "${SIGN_VERIFY_JSON}" \
    "${ATTEST_VERIFY_JSON}" \
    "${SERVICE_RESULT}" \
    "${RESULTS_JSONL}" \
    "${service}" \
    "${immutable_reference}" \
    "${sbom_path}" \
    "${sbom_sha256}" \
    "${SOURCE_COMMIT}" \
    "${KMS_KEY_ARN}" \
    <<'PY'
import json
import sys
from pathlib import Path

(
    signature_path_value,
    attestation_path_value,
    result_path_value,
    jsonl_path_value,
    service,
    immutable_reference,
    sbom_path,
    sbom_sha256,
    source_commit,
    kms_key_arn,
) = sys.argv[1:]

signature_path = Path(signature_path_value)
attestation_path = Path(attestation_path_value)
result_path = Path(result_path_value)
jsonl_path = Path(jsonl_path_value)


def parse_json_output(path: Path):
    text = path.read_text(
        encoding="utf-8"
    ).strip()

    if not text:
        return []

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = [
            json.loads(line)
            for line in text.splitlines()
            if line.strip()
        ]

    if isinstance(parsed, list):
        return parsed

    return [parsed]


signature_results = parse_json_output(
    signature_path
)

attestation_results = parse_json_output(
    attestation_path
)

if not signature_results:
    raise SystemExit(
        f"FAIL: no verified signature result for {service}"
    )

if not attestation_results:
    raise SystemExit(
        f"FAIL: no verified attestation result for {service}"
    )

result = {
    "service": service,
    "immutable_reference": immutable_reference,
    "source_commit": source_commit,
    "kms_key_arn": kms_key_arn,
    "sbom_path": sbom_path,
    "sbom_sha256": sbom_sha256,
    "predicate_type": "https://spdx.dev/Document",
    "signature_verified": True,
    "attestation_verified": True,
    "transparency_log_uploaded": False,
    "registry_tls_verified": True,
    "validation_passed": True,
}

result_path.write_text(
    json.dumps(
        result,
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)

with jsonl_path.open(
    "a",
    encoding="utf-8",
) as handle:
    handle.write(
        json.dumps(
            result,
            sort_keys=True,
        )
        + "\n"
    )
PY

  log \
    "PASS: ${service} signature and SPDX attestation verified"
done < "${SIGNING_INPUT}"

PRIVATE_KEY_COUNT="$(
  find "${REPORT_DIR}" \
    -maxdepth 1 \
    -type f \
    \( \
      -name '*.key' \
      -o -iname '*private*' \
    \) |
  wc -l |
  tr -d '[:space:]'
)"

[ "${PRIVATE_KEY_COUNT}" -eq 0 ] ||
  die "Private-key-like files were found in Cosign evidence"

export \
  RESULTS_JSONL \
  SUMMARY_JSON \
  SUMMARY_TEXT \
  ACTUAL_COSIGN_VERSION \
  AWS_REGION \
  HARBOR_REGISTRY \
  HARBOR_PROJECT \
  SOURCE_COMMIT \
  KMS_KEY_ARN

python3 - <<'PY'
import json
import os
from pathlib import Path

results_path = Path(
    os.environ["RESULTS_JSONL"]
)

results = [
    json.loads(line)
    for line in results_path.read_text(
        encoding="utf-8"
    ).splitlines()
    if line.strip()
]

if len(results) != 6:
    raise SystemExit(
        f"FAIL: expected 6 Cosign results, found {len(results)}"
    )

services = {
    result["service"]
    for result in results
}

references = {
    result["immutable_reference"]
    for result in results
}

if len(services) != 6:
    raise SystemExit(
        "FAIL: Cosign service results are not unique"
    )

if len(references) != 6:
    raise SystemExit(
        "FAIL: signed digest references are not unique"
    )

for result in results:
    if result.get("signature_verified") is not True:
        raise SystemExit(
            f"FAIL: signature verification failed for "
            f"{result['service']}"
        )

    if result.get("attestation_verified") is not True:
        raise SystemExit(
            f"FAIL: attestation verification failed for "
            f"{result['service']}"
        )

summary = {
    "cosign_version": os.environ[
        "ACTUAL_COSIGN_VERSION"
    ],
    "aws_region": os.environ["AWS_REGION"],
    "registry": os.environ["HARBOR_REGISTRY"],
    "project": os.environ["HARBOR_PROJECT"],
    "source_commit": os.environ["SOURCE_COMMIT"],
    "kms_key_arn": os.environ["KMS_KEY_ARN"],
    "predicate_type": "https://spdx.dev/Document",
    "images_signed": 6,
    "signatures_verified": 6,
    "spdx_attestations_created": 6,
    "spdx_attestations_verified": 6,
    "private_key_files": 0,
    "transparency_log_uploaded": False,
    "registry_tls_verified": True,
    "images": results,
    "validation_passed": True,
}

Path(os.environ["SUMMARY_JSON"]).write_text(
    json.dumps(
        summary,
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)

lines = [
    f"Cosign version: {summary['cosign_version']}",
    f"AWS Region: {summary['aws_region']}",
    f"Registry: {summary['registry']}",
    f"Project: {summary['project']}",
    f"Source commit: {summary['source_commit']}",
    f"KMS key: {summary['kms_key_arn']}",
    f"Predicate type: {summary['predicate_type']}",
    "Images signed: 6",
    "Signatures verified: 6",
    "SPDX attestations created: 6",
    "SPDX attestations verified: 6",
    "Private-key files: 0",
    "Transparency-log upload: false",
    "Registry TLS verified: true",
    "Validation passed: true",
]

Path(os.environ["SUMMARY_TEXT"]).write_text(
    "\n".join(lines) + "\n",
    encoding="utf-8",
)

print("\n".join(lines))
PY

CHECKSUM_TMP="$(
  mktemp /tmp/vaultbank-cosign-oci-checksums.XXXXXX
)"

(
  cd "${REPORT_DIR}"

  find . \
    -maxdepth 1 \
    -type f \
    ! -name "$(basename "${CHECKSUM_FILE}")" \
    -print0 |
  sort -z |
  xargs -0 sha256sum
) > "${CHECKSUM_TMP}"

mv "${CHECKSUM_TMP}" "${CHECKSUM_FILE}"
CHECKSUM_TMP=""

(
  cd "${REPORT_DIR}"

  sha256sum \
    --check \
    "$(basename "${CHECKSUM_FILE}")"
)

find "${REPORT_DIR}" \
  -type f \
  -exec chmod 640 {} +

log \
  "PASS: six Harbor digests signed and SPDX attestations verified"
