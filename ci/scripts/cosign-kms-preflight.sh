#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" &&
  pwd
)"

# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

use_phase_report_dir "phase-10-cosign-kms-preflight"

VERSIONS_FILE="${ROOT_DIR}/config/tool-versions.env"

PUBLIC_KEY="${REPORT_DIR}/cosign.pub"
SUBJECT_FILE="${REPORT_DIR}/subject.txt"
SIGNATURE_BUNDLE="${REPORT_DIR}/subject.sigstore.json"
SIGN_CREATE_LOG="${REPORT_DIR}/signature-create.log"
SIGN_KMS_VERIFY_LOG="${REPORT_DIR}/signature-kms-verify.log"
SIGN_PUBLIC_VERIFY_LOG="${REPORT_DIR}/signature-public-key-verify.log"
TAMPER_LOG="${REPORT_DIR}/tamper-verification.log"

PREDICATE_FILE="${REPORT_DIR}/predicate.json"
ATTESTATION_BUNDLE="${REPORT_DIR}/attestation.sigstore.json"
ATTEST_CREATE_LOG="${REPORT_DIR}/attestation-create.log"
ATTEST_KMS_VERIFY_LOG="${REPORT_DIR}/attestation-kms-verify.log"
ATTEST_PUBLIC_VERIFY_LOG="${REPORT_DIR}/attestation-public-key-verify.log"

SUMMARY_JSON="${REPORT_DIR}/cosign-preflight-summary.json"
SUMMARY_TEXT="${REPORT_DIR}/cosign-preflight-summary.txt"
METADATA_FILE="${REPORT_DIR}/cosign-preflight-metadata.txt"
CHECKSUM_FILE="${REPORT_DIR}/cosign-preflight-checksums.sha256"

require_command aws
require_command cosign
require_command openssl
require_command python3
require_command sha256sum
require_command find
require_command awk

[ -f "${VERSIONS_FILE}" ] ||
  die "Missing tool-version policy: ${VERSIONS_FILE}"

# shellcheck disable=SC1090
source "${VERSIONS_FILE}"

COSIGN_VERSION="${COSIGN_VERSION:-}"
COSIGN_KEY_REF="${COSIGN_KEY_REF:-}"

AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION}}"

[ -n "${COSIGN_VERSION}" ] ||
  die "COSIGN_VERSION is missing from ${VERSIONS_FILE}"

[ -n "${COSIGN_KEY_REF}" ] ||
  die "COSIGN_KEY_REF is missing from ${VERSIONS_FILE}"

[ -n "${AWS_REGION}" ] ||
  die "AWS_REGION and AWS_DEFAULT_REGION are empty"

case "${COSIGN_KEY_REF}" in
  awskms:///*)
    ;;
  *)
    die \
      "Expected an AWS KMS Cosign key reference, found ${COSIGN_KEY_REF}"
    ;;
esac

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

if [ "${ACTUAL_COSIGN_VERSION}" != "${COSIGN_VERSION}" ]; then
  die \
    "Installed Cosign ${ACTUAL_COSIGN_VERSION} does not match policy ${COSIGN_VERSION}"
fi

KMS_KEY_ID="${COSIGN_KEY_REF#awskms:///}"

[ -n "${KMS_KEY_ID}" ] ||
  die "Unable to extract AWS KMS key identifier"

AWS_ACCOUNT_ID="$(
  aws sts get-caller-identity \
    --query Account \
    --output text
)"

AWS_CALLER_ARN="$(
  aws sts get-caller-identity \
    --query Arn \
    --output text
)"

[ -n "${AWS_ACCOUNT_ID}" ] ||
  die "Unable to determine AWS account"

[ -n "${AWS_CALLER_ARN}" ] ||
  die "Unable to determine AWS caller ARN"

KMS_KEY_ARN="$(
  aws kms describe-key \
    --key-id "${KMS_KEY_ID}" \
    --query 'KeyMetadata.Arn' \
    --output text
)"

KMS_STATE="$(
  aws kms describe-key \
    --key-id "${KMS_KEY_ID}" \
    --query 'KeyMetadata.KeyState' \
    --output text
)"

KMS_USAGE="$(
  aws kms describe-key \
    --key-id "${KMS_KEY_ID}" \
    --query 'KeyMetadata.KeyUsage' \
    --output text
)"

KMS_SPEC="$(
  aws kms describe-key \
    --key-id "${KMS_KEY_ID}" \
    --query 'KeyMetadata.KeySpec' \
    --output text
)"

KMS_ENABLED="$(
  aws kms describe-key \
    --key-id "${KMS_KEY_ID}" \
    --query 'KeyMetadata.Enabled' \
    --output text
)"

[ "${KMS_STATE}" = "Enabled" ] ||
  die "KMS key state must be Enabled, found ${KMS_STATE}"

[ "${KMS_USAGE}" = "SIGN_VERIFY" ] ||
  die "KMS key usage must be SIGN_VERIFY, found ${KMS_USAGE}"

[ "${KMS_SPEC}" = "ECC_NIST_P256" ] ||
  die "KMS key specification must be ECC_NIST_P256, found ${KMS_SPEC}"

[ "${KMS_ENABLED}" = "True" ] ||
  die "KMS key is not enabled"

rm -rf "${REPORT_DIR}"

mkdir -p "${REPORT_DIR}"

SOURCE_COMMIT="$(full_commit)"

resolve_source_branch() {
  local branch=""

  if [ -n "${CHANGE_BRANCH:-}" ]; then
    branch="${CHANGE_BRANCH}"
  elif [ -n "${BRANCH_NAME:-}" ]; then
    branch="${BRANCH_NAME}"
  elif [ -n "${GIT_LOCAL_BRANCH:-}" ]; then
    branch="${GIT_LOCAL_BRANCH}"
  elif [ -n "${GIT_BRANCH:-}" ]; then
    branch="${GIT_BRANCH}"
  else
    branch="$(
      git -C "${ROOT_DIR}"         branch --show-current
    )"
  fi

  if [ -z "${branch}" ]; then
    branch="$(
      git -C "${ROOT_DIR}"         for-each-ref         --format='%(refname:short)'         --points-at HEAD         refs/heads         refs/remotes/origin |
      awk '
        $0 != "origin/HEAD" {
          print
          exit
        }
      '
    )"
  fi

  branch="${branch#refs/heads/}"
  branch="${branch#refs/remotes/}"
  branch="${branch#origin/}"

  printf '%s\n' "${branch}"
}

SOURCE_BRANCH="$(resolve_source_branch)"

[ -n "${SOURCE_BRANCH}" ] ||
  die     "Unable to determine source branch from Jenkins or Git metadata"

log "Resolved source branch: ${SOURCE_BRANCH}"

log "Exporting public key from AWS KMS"

cosign public-key \
  --key "${COSIGN_KEY_REF}" \
  > "${PUBLIC_KEY}"

[ -s "${PUBLIC_KEY}" ] ||
  die "Cosign public key was not generated"

openssl pkey \
  -pubin \
  -in "${PUBLIC_KEY}" \
  -noout \
  >/dev/null

PUBLIC_KEY_FIRST_LINE="$(
  head -1 "${PUBLIC_KEY}"
)"

PUBLIC_KEY_LAST_LINE="$(
  tail -1 "${PUBLIC_KEY}"
)"

[ "${PUBLIC_KEY_FIRST_LINE}" = "-----BEGIN PUBLIC KEY-----" ] ||
  die "Invalid public-key opening boundary"

[ "${PUBLIC_KEY_LAST_LINE}" = "-----END PUBLIC KEY-----" ] ||
  die "Invalid public-key closing boundary"

printf '%s\n' \
  "artifact=vault-bank-cosign-preflight" \
  "source_commit=${SOURCE_COMMIT}" \
  "source_branch=${SOURCE_BRANCH}" \
  "kms_key=${KMS_KEY_ARN}" \
  > "${SUBJECT_FILE}"

log "Signing preflight subject through AWS KMS"

cosign sign-blob \
  --yes \
  --use-signing-config=false \
  --key "${COSIGN_KEY_REF}" \
  --bundle "${SIGNATURE_BUNDLE}" \
  "${SUBJECT_FILE}" \
  > "${SIGN_CREATE_LOG}" \
  2>&1

[ -s "${SIGNATURE_BUNDLE}" ] ||
  die "Cosign signature bundle was not generated"

python3 -m json.tool \
  "${SIGNATURE_BUNDLE}" \
  >/dev/null

log "Verifying blob signature using AWS KMS"

cosign verify-blob \
  --key "${COSIGN_KEY_REF}" \
  --bundle "${SIGNATURE_BUNDLE}" \
  "${SUBJECT_FILE}" \
  > "${SIGN_KMS_VERIFY_LOG}" \
  2>&1

grep -q "Verified OK" \
  "${SIGN_KMS_VERIFY_LOG}" ||
  die "AWS KMS blob verification did not report Verified OK"

log "Verifying blob signature using exported public key"

cosign verify-blob \
  --key "${PUBLIC_KEY}" \
  --bundle "${SIGNATURE_BUNDLE}" \
  "${SUBJECT_FILE}" \
  > "${SIGN_PUBLIC_VERIFY_LOG}" \
  2>&1

grep -q "Verified OK" \
  "${SIGN_PUBLIC_VERIFY_LOG}" ||
  die "Public-key blob verification did not report Verified OK"

TAMPERED_FILE="${REPORT_DIR}/subject-tampered.txt"

cp \
  "${SUBJECT_FILE}" \
  "${TAMPERED_FILE}"

printf '%s\n' \
  "tampered=true" \
  >> "${TAMPERED_FILE}"

set +e

cosign verify-blob \
  --key "${PUBLIC_KEY}" \
  --bundle "${SIGNATURE_BUNDLE}" \
  "${TAMPERED_FILE}" \
  > "${TAMPER_LOG}" \
  2>&1

TAMPER_EXIT=$?

set -e

rm -f "${TAMPERED_FILE}"

if [ "${TAMPER_EXIT}" -eq 0 ]; then
  die "Tampered preflight subject was incorrectly accepted"
fi

log "PASS: tampered subject was rejected"

python3 - \
  "${PREDICATE_FILE}" \
  "${SOURCE_COMMIT}" \
  "${SOURCE_BRANCH}" \
  "${KMS_KEY_ARN}" \
  <<'PY'
import json
import sys
from pathlib import Path

(
    output_path_value,
    source_commit,
    source_branch,
    kms_key_arn,
) = sys.argv[1:]

predicate = {
    "project": "vault_bank",
    "phase": "phase-4d-cosign-kms-preflight",
    "source_commit": source_commit,
    "source_branch": source_branch,
    "signing_key": kms_key_arn,
    "controls": {
        "kms_key_usage": "SIGN_VERIFY",
        "kms_key_spec": "ECC_NIST_P256",
        "private_key_exported": False,
        "tamper_detection_passed": True,
        "validation_passed": True,
    },
}

Path(output_path_value).write_text(
    json.dumps(
        predicate,
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)
PY

python3 -m json.tool \
  "${PREDICATE_FILE}" \
  >/dev/null

log "Creating KMS-signed blob attestation"

cosign attest-blob \
  --yes \
  --use-signing-config=false \
  --key "${COSIGN_KEY_REF}" \
  --predicate "${PREDICATE_FILE}" \
  --type custom \
  --bundle "${ATTESTATION_BUNDLE}" \
  "${SUBJECT_FILE}" \
  > "${ATTEST_CREATE_LOG}" \
  2>&1

[ -s "${ATTESTATION_BUNDLE}" ] ||
  die "Cosign attestation bundle was not generated"

python3 -m json.tool \
  "${ATTESTATION_BUNDLE}" \
  >/dev/null

log "Verifying attestation using AWS KMS"

cosign verify-blob-attestation \
  --check-claims=true \
  --key "${COSIGN_KEY_REF}" \
  --bundle "${ATTESTATION_BUNDLE}" \
  --type custom \
  "${SUBJECT_FILE}" \
  > "${ATTEST_KMS_VERIFY_LOG}" \
  2>&1

grep -q "Verified OK" \
  "${ATTEST_KMS_VERIFY_LOG}" ||
  die "AWS KMS attestation verification did not report Verified OK"

log "Verifying attestation using exported public key"

cosign verify-blob-attestation \
  --check-claims=true \
  --key "${PUBLIC_KEY}" \
  --bundle "${ATTESTATION_BUNDLE}" \
  --type custom \
  "${SUBJECT_FILE}" \
  > "${ATTEST_PUBLIC_VERIFY_LOG}" \
  2>&1

grep -q "Verified OK" \
  "${ATTEST_PUBLIC_VERIFY_LOG}" ||
  die "Public-key attestation verification did not report Verified OK"

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

if [ "${PRIVATE_KEY_COUNT}" -ne 0 ]; then
  die \
    "Private-key-like files were found in the evidence directory"
fi

export \
  ACTUAL_COSIGN_VERSION \
  AWS_ACCOUNT_ID \
  AWS_CALLER_ARN \
  AWS_REGION \
  KMS_KEY_ARN \
  KMS_STATE \
  KMS_USAGE \
  KMS_SPEC \
  SOURCE_COMMIT \
  SOURCE_BRANCH \
  SUMMARY_JSON \
  SUMMARY_TEXT

python3 - <<'PY'
import json
import os
from pathlib import Path

summary = {
    "cosign_version": os.environ[
        "ACTUAL_COSIGN_VERSION"
    ],
    "aws_region": os.environ["AWS_REGION"],
    "aws_account_id": os.environ["AWS_ACCOUNT_ID"],
    "aws_caller_arn": os.environ["AWS_CALLER_ARN"],
    "source_commit": os.environ["SOURCE_COMMIT"],
    "source_branch": os.environ["SOURCE_BRANCH"],
    "kms_key_arn": os.environ["KMS_KEY_ARN"],
    "kms_state": os.environ["KMS_STATE"],
    "kms_usage": os.environ["KMS_USAGE"],
    "kms_spec": os.environ["KMS_SPEC"],
    "blob_kms_verified": True,
    "blob_public_key_verified": True,
    "tamper_rejected": True,
    "attestation_kms_verified": True,
    "attestation_public_key_verified": True,
    "claims_checking_enabled": True,
    "private_key_files": 0,
    "validation_passed": True,
}

summary_path = Path(os.environ["SUMMARY_JSON"])
summary_text_path = Path(os.environ["SUMMARY_TEXT"])

summary_path.write_text(
    json.dumps(
        summary,
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)

lines = [
    (
        "Cosign version: "
        f"{summary['cosign_version']}"
    ),
    (
        "AWS Region: "
        f"{summary['aws_region']}"
    ),
    (
        "AWS caller: "
        f"{summary['aws_caller_arn']}"
    ),
    (
        "KMS key: "
        f"{summary['kms_key_arn']}"
    ),
    (
        "KMS state: "
        f"{summary['kms_state']}"
    ),
    (
        "KMS usage: "
        f"{summary['kms_usage']}"
    ),
    (
        "KMS spec: "
        f"{summary['kms_spec']}"
    ),
    "Blob KMS verification: true",
    "Blob public-key verification: true",
    "Tamper rejected: true",
    "Attestation KMS verification: true",
    "Attestation public-key verification: true",
    "Claims checking enabled: true",
    "Private-key files: 0",
    "Validation passed: true",
]

summary_text_path.write_text(
    "\n".join(lines) + "\n",
    encoding="utf-8",
)

print("\n".join(lines))
PY

printf '%s\n' \
  "cosign_version=${ACTUAL_COSIGN_VERSION}" \
  "aws_region=${AWS_REGION}" \
  "aws_account_id=${AWS_ACCOUNT_ID}" \
  "aws_caller_arn=${AWS_CALLER_ARN}" \
  "kms_key_arn=${KMS_KEY_ARN}" \
  "kms_state=${KMS_STATE}" \
  "kms_usage=${KMS_USAGE}" \
  "kms_spec=${KMS_SPEC}" \
  "source_commit=${SOURCE_COMMIT}" \
  "source_branch=${SOURCE_BRANCH}" \
  "validation_passed=true" \
  > "${METADATA_FILE}"

CHECKSUM_TMP="$(
  mktemp /tmp/vaultbank-cosign-checksums.XXXXXX
)"

cleanup_checksum_tmp() {
  rm -f "${CHECKSUM_TMP}"
}

trap cleanup_checksum_tmp EXIT

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

find "${REPORT_DIR}" \
  -type f \
  -exec chmod 640 {} +

log "PASS: AWS KMS Cosign signing preflight"
