#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" &&
  pwd
)"

# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-13-release-manifest"

VERSIONS_FILE="${ROOT_DIR}/config/tool-versions.env"

PUBLICATION_MANIFEST="${PUBLICATION_MANIFEST:-${ROOT_DIR}/reports/phase-10-harbor-publish/harbor-publication-manifest.json}"
TRIVY_SUMMARY="${TRIVY_SUMMARY:-${ROOT_DIR}/reports/phase-11-trivy-registry/trivy-registry-summary.json}"
COSIGN_SUMMARY="${COSIGN_SUMMARY:-${ROOT_DIR}/reports/phase-12-cosign-oci/cosign-oci-summary.json}"

RELEASE_MANIFEST="${REPORT_DIR}/vault-bank-release-manifest.json"
RELEASE_BUNDLE="${REPORT_DIR}/vault-bank-release-manifest.sigstore.json"
PUBLIC_KEY="${REPORT_DIR}/cosign-kms-public-key.pem"

SIGN_LOG="${REPORT_DIR}/release-manifest-sign.log"
VERIFY_LOG="${REPORT_DIR}/release-manifest-verify.log"
TAMPER_LOG="${REPORT_DIR}/release-manifest-tamper-test.log"

SUMMARY_JSON="${REPORT_DIR}/release-manifest-summary.json"
SUMMARY_TEXT="${REPORT_DIR}/release-manifest-summary.txt"
CHECKSUM_FILE="${REPORT_DIR}/release-manifest-checksums.sha256"

require_command aws
require_command cosign
require_command openssl
require_command python3
require_command sha256sum
require_command mktemp
require_command find
require_command sort
require_command xargs
require_command sed

[ -f "${VERSIONS_FILE}" ] ||
  die "Tool-version policy is missing: ${VERSIONS_FILE}"

# shellcheck disable=SC1090
source "${VERSIONS_FILE}"

[ -n "${COSIGN_VERSION:-}" ] ||
  die "COSIGN_VERSION is missing"

[ -n "${COSIGN_KEY_REF:-}" ] ||
  die "COSIGN_KEY_REF is missing"

case "${COSIGN_KEY_REF}" in
  awskms:///*)
    ;;
  *)
    die "Expected AWS KMS Cosign key reference"
    ;;
esac

for required_file in \
  "${PUBLICATION_MANIFEST}" \
  "${TRIVY_SUMMARY}" \
  "${COSIGN_SUMMARY}"
do
  [ -s "${required_file}" ] ||
    die "Required release evidence is missing: ${required_file}"
done

AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION}}"

[ -n "${AWS_REGION}" ] ||
  die "AWS_REGION is required"

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

[ "${ACTUAL_COSIGN_VERSION}" = "${COSIGN_VERSION}" ] ||
  die \
    "Installed Cosign ${ACTUAL_COSIGN_VERSION} does not match ${COSIGN_VERSION}"

SOURCE_COMMIT="$(full_commit)"

SOURCE_BRANCH="${BRANCH_NAME:-}"

if [ -z "${SOURCE_BRANCH}" ]; then
  SOURCE_BRANCH="$(
    git -C "${ROOT_DIR}" \
      branch --show-current
  )"
fi

[ -n "${SOURCE_BRANCH}" ] ||
  SOURCE_BRANCH="detached-${SOURCE_COMMIT:0:12}"

BUILD_IDENTIFIER="${BUILD_NUMBER:-local}"

BUILD_IDENTIFIER="$(
  printf '%s' "${BUILD_IDENTIFIER}" |
  sed -E \
    's/[^a-zA-Z0-9_.-]+/-/g; s/^-+//; s/-+$//'
)"

[ -n "${BUILD_IDENTIFIER}" ] ||
  die "Unable to determine build identifier"

RELEASE_ID="vault-bank-${SOURCE_COMMIT:0:12}-b${BUILD_IDENTIFIER}"

KMS_KEY_ID="${COSIGN_KEY_REF#awskms:///}"

KMS_KEY_ARN="$(
  aws kms describe-key \
    --region "${AWS_REGION}" \
    --key-id "${KMS_KEY_ID}" \
    --query 'KeyMetadata.Arn' \
    --output text
)"

KMS_KEY_STATE="$(
  aws kms describe-key \
    --region "${AWS_REGION}" \
    --key-id "${KMS_KEY_ID}" \
    --query 'KeyMetadata.KeyState' \
    --output text
)"

KMS_KEY_USAGE="$(
  aws kms describe-key \
    --region "${AWS_REGION}" \
    --key-id "${KMS_KEY_ID}" \
    --query 'KeyMetadata.KeyUsage' \
    --output text
)"

[ "${KMS_KEY_STATE}" = "Enabled" ] ||
  die "AWS KMS key is not enabled"

[ "${KMS_KEY_USAGE}" = "SIGN_VERIFY" ] ||
  die "AWS KMS key does not have SIGN_VERIFY usage"

rm -rf "${REPORT_DIR}"
mkdir -p "${REPORT_DIR}"

log "Creating verified release manifest ${RELEASE_ID}"

python3 - \
  "${PUBLICATION_MANIFEST}" \
  "${TRIVY_SUMMARY}" \
  "${COSIGN_SUMMARY}" \
  "${RELEASE_MANIFEST}" \
  "${RELEASE_ID}" \
  "${SOURCE_COMMIT}" \
  "${SOURCE_BRANCH}" \
  "${BUILD_IDENTIFIER}" \
  "${KMS_KEY_ARN}" \
  <<'PY'
import datetime
import json
import re
import sys
from pathlib import Path

(
    publication_path_value,
    trivy_path_value,
    cosign_path_value,
    output_path_value,
    release_id,
    source_commit,
    source_branch,
    build_identifier,
    kms_key_arn,
) = sys.argv[1:]

publication_path = Path(publication_path_value)
trivy_path = Path(trivy_path_value)
cosign_path = Path(cosign_path_value)
output_path = Path(output_path_value)

publication = json.loads(
    publication_path.read_text(encoding="utf-8")
)

trivy = json.loads(
    trivy_path.read_text(encoding="utf-8")
)

cosign = json.loads(
    cosign_path.read_text(encoding="utf-8")
)

expected_services = {
    "account-service",
    "auth-service",
    "frontend",
    "notification-service",
    "payment-service",
    "transaction-service",
}

for name, document in (
    ("publication", publication),
    ("Trivy", trivy),
    ("Cosign", cosign),
):
    if document.get("source_commit") != source_commit:
        raise SystemExit(
            f"FAIL: {name} source commit does not match "
            f"{source_commit}"
        )

if publication.get("registry") != (
    "harbor.vaultbank.internal:9443"
):
    raise SystemExit(
        "FAIL: unexpected Harbor registry"
    )

if publication.get("project") != "vault-bank":
    raise SystemExit(
        "FAIL: unexpected Harbor project"
    )

if publication.get("images_pushed") != 6:
    raise SystemExit(
        "FAIL: publication manifest does not contain six images"
    )

if publication.get("validation_passed") is not True:
    raise SystemExit(
        "FAIL: Harbor publication validation failed"
    )

required_zero_fields = (
    "critical_vulnerabilities",
    "fixable_high_vulnerabilities",
    "secret_findings",
    "misconfiguration_findings",
)

for field in required_zero_fields:
    if trivy.get(field) != 0:
        raise SystemExit(
            f"FAIL: Trivy field {field} is non-zero"
        )

if trivy.get("images_scanned") != 6:
    raise SystemExit(
        "FAIL: Trivy did not scan six images"
    )

if trivy.get("validation_passed") is not True:
    raise SystemExit(
        "FAIL: Trivy digest validation failed"
    )

required_cosign_values = {
    "images_signed": 6,
    "signatures_verified": 6,
    "spdx_attestations_created": 6,
    "spdx_attestations_verified": 6,
    "private_key_files": 0,
    "registry_tls_verified": True,
    "validation_passed": True,
}

for field, expected_value in required_cosign_values.items():
    if cosign.get(field) != expected_value:
        raise SystemExit(
            f"FAIL: Cosign field {field} expected "
            f"{expected_value}, found {cosign.get(field)}"
        )

if cosign.get("kms_key_arn") != kms_key_arn:
    raise SystemExit(
        "FAIL: Cosign KMS key does not match release key"
    )

publication_images = {
    image["service"]: image
    for image in publication.get("images") or []
}

trivy_images = {
    image["service"]: image
    for image in trivy.get("images") or []
}

cosign_images = {
    image["service"]: image
    for image in cosign.get("images") or []
}

for name, image_map in (
    ("publication", publication_images),
    ("Trivy", trivy_images),
    ("Cosign", cosign_images),
):
    if set(image_map) != expected_services:
        raise SystemExit(
            f"FAIL: {name} service set does not match policy"
        )

reference_pattern = re.compile(
    r"^harbor\.vaultbank\.internal:9443/"
    r"vault-bank/[a-z0-9._-]+"
    r"@sha256:[0-9a-f]{64}$"
)

release_images = []

for service in sorted(expected_services):
    publication_image = publication_images[service]
    trivy_image = trivy_images[service]
    cosign_image = cosign_images[service]

    reference = publication_image.get(
        "immutable_reference",
        "",
    )

    if not reference_pattern.fullmatch(reference):
        raise SystemExit(
            f"FAIL: invalid immutable reference for {service}"
        )

    if trivy_image.get("immutable_reference") != reference:
        raise SystemExit(
            f"FAIL: Trivy reference mismatch for {service}"
        )

    if cosign_image.get("immutable_reference") != reference:
        raise SystemExit(
            f"FAIL: Cosign reference mismatch for {service}"
        )

    if trivy_image.get("gate_passed") is not True:
        raise SystemExit(
            f"FAIL: Trivy service gate failed for {service}"
        )

    if cosign_image.get("signature_verified") is not True:
        raise SystemExit(
            f"FAIL: signature is not verified for {service}"
        )

    if cosign_image.get("attestation_verified") is not True:
        raise SystemExit(
            f"FAIL: attestation is not verified for {service}"
        )

    sbom_sha256 = cosign_image.get("sbom_sha256", "")

    if not re.fullmatch(
        r"[0-9a-f]{64}",
        sbom_sha256,
    ):
        raise SystemExit(
            f"FAIL: invalid SBOM checksum for {service}"
        )

    release_images.append(
        {
            "service": service,
            "image": reference,
            "digest": publication_image.get("digest"),
            "sbom": {
                "format": "SPDX JSON",
                "sha256": sbom_sha256,
                "attestation_verified": True,
            },
            "security": {
                "critical_vulnerabilities": 0,
                "fixable_high_vulnerabilities": 0,
                "secret_findings": 0,
                "misconfiguration_findings": 0,
                "trivy_gate_passed": True,
            },
            "signature": {
                "kms_key_arn": kms_key_arn,
                "verified": True,
            },
        }
    )

manifest = {
    "schema_version": "1.0",
    "release_id": release_id,
    "application": "vault-bank",
    "promotion_target": "staging",
    "source": {
        "repository": (
            "https://github.com/sonappatil/vault_bank.git"
        ),
        "branch": source_branch,
        "commit": source_commit,
        "jenkins_build": build_identifier,
    },
    "registry": {
        "hostname": "harbor.vaultbank.internal:9443",
        "project": "vault-bank",
        "tls_verified": True,
        "immutable_tags_enforced": True,
    },
    "security_gates": {
        "harbor_publication_passed": True,
        "trivy_digest_scan_passed": True,
        "cosign_signatures_verified": True,
        "spdx_attestations_verified": True,
        "private_signing_key_exported": False,
    },
    "images": release_images,
    "image_count": len(release_images),
    "created_at": (
        datetime.datetime.now(
            datetime.timezone.utc
        )
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    ),
    "release_status": "verified",
}

output_path.write_text(
    json.dumps(
        manifest,
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)

print(
    f"PASS: verified release manifest created "
    f"with {len(release_images)} images"
)
PY

python3 -m json.tool \
  "${RELEASE_MANIFEST}" \
  >/dev/null

log "Exporting AWS KMS public key"

cosign public-key \
  --key "${COSIGN_KEY_REF}" \
  > "${PUBLIC_KEY}"

openssl pkey \
  -pubin \
  -in "${PUBLIC_KEY}" \
  -noout \
  >/dev/null

log "Signing verified release manifest"

cosign sign-blob \
  --yes \
  --use-signing-config=false \
  --key "${COSIGN_KEY_REF}" \
  --bundle "${RELEASE_BUNDLE}" \
  "${RELEASE_MANIFEST}" \
  > "${SIGN_LOG}" \
  2>&1

[ -s "${RELEASE_BUNDLE}" ] ||
  die "Release signature bundle was not generated"

python3 -m json.tool \
  "${RELEASE_BUNDLE}" \
  >/dev/null

log "Verifying release-manifest signature"

cosign verify-blob \
  --key "${PUBLIC_KEY}" \
  --bundle "${RELEASE_BUNDLE}" \
  "${RELEASE_MANIFEST}" \
  > "${VERIFY_LOG}" \
  2>&1

grep -q 'Verified OK' \
  "${VERIFY_LOG}" ||
  die "Release-manifest signature verification failed"

TAMPERED_MANIFEST="${REPORT_DIR}/tampered-release-manifest.json"

cp \
  "${RELEASE_MANIFEST}" \
  "${TAMPERED_MANIFEST}"

printf '\n' \
  >> "${TAMPERED_MANIFEST}"

printf '{"tampered":true}\n' \
  >> "${TAMPERED_MANIFEST}"

set +e

cosign verify-blob \
  --key "${PUBLIC_KEY}" \
  --bundle "${RELEASE_BUNDLE}" \
  "${TAMPERED_MANIFEST}" \
  > "${TAMPER_LOG}" \
  2>&1

TAMPER_EXIT=$?

set -e

rm -f "${TAMPERED_MANIFEST}"

if [ "${TAMPER_EXIT}" -eq 0 ]; then
  die "Tampered release manifest was incorrectly accepted"
fi

log "PASS: tampered release manifest was rejected"

MANIFEST_SHA256="$(
  sha256sum "${RELEASE_MANIFEST}" |
  awk '{print $1}'
)"

export \
  SUMMARY_JSON \
  SUMMARY_TEXT \
  RELEASE_ID \
  SOURCE_COMMIT \
  SOURCE_BRANCH \
  BUILD_IDENTIFIER \
  MANIFEST_SHA256 \
  KMS_KEY_ARN \
  ACTUAL_COSIGN_VERSION

python3 - <<'PY'
import json
import os
from pathlib import Path

summary = {
    "release_id": os.environ["RELEASE_ID"],
    "application": "vault-bank",
    "promotion_target": "staging",
    "source_commit": os.environ["SOURCE_COMMIT"],
    "source_branch": os.environ["SOURCE_BRANCH"],
    "jenkins_build": os.environ["BUILD_IDENTIFIER"],
    "release_manifest_sha256": os.environ[
        "MANIFEST_SHA256"
    ],
    "kms_key_arn": os.environ["KMS_KEY_ARN"],
    "cosign_version": os.environ[
        "ACTUAL_COSIGN_VERSION"
    ],
    "image_count": 6,
    "release_signature_verified": True,
    "tamper_test_passed": True,
    "private_key_files": 0,
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
    f"Release ID: {summary['release_id']}",
    "Application: vault-bank",
    "Promotion target: staging",
    f"Source commit: {summary['source_commit']}",
    f"Source branch: {summary['source_branch']}",
    f"Jenkins build: {summary['jenkins_build']}",
    f"Release manifest SHA256: "
    f"{summary['release_manifest_sha256']}",
    f"KMS key: {summary['kms_key_arn']}",
    "Images: 6",
    "Release signature verified: true",
    "Tamper test passed: true",
    "Private-key files: 0",
    "Validation passed: true",
]

Path(os.environ["SUMMARY_TEXT"]).write_text(
    "\n".join(lines) + "\n",
    encoding="utf-8",
)

print("\n".join(lines))
PY

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
  die "Private-key-like file found in release evidence"

CHECKSUM_TMP="$(
  mktemp /tmp/vaultbank-release-checksums.XXXXXX
)"

cleanup() {
  rm -f "${CHECKSUM_TMP}"
}

trap cleanup EXIT

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

trap - EXIT

(
  cd "${REPORT_DIR}"

  sha256sum \
    --check \
    "$(basename "${CHECKSUM_FILE}")"
)

find "${REPORT_DIR}" \
  -type f \
  -exec chmod 640 {} +

log "PASS: verified Vault Bank release manifest generated"
