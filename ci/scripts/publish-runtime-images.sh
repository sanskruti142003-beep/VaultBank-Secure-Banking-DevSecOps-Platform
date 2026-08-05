#!/usr/bin/env bash

set -Eeuo pipefail

publish_runtime_error() {
  local exit_code="$?"
  local line_number="${BASH_LINENO[0]:-unknown}"

  printf     'FAIL: runtime publication stopped near line %s with exit %s\n'     "${line_number}"     "${exit_code}"     >&2

  exit "${exit_code}"
}

trap publish_runtime_error ERR

umask 027

SCRIPT_DIR="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &&
  pwd
)"

ROOT_DIR="$(
  cd -- "${SCRIPT_DIR}/../.." &&
  pwd
)"

RUNTIME_IMAGE_ENV="${RUNTIME_IMAGE_ENV:-${HOME}/.config/vault-bank/runtime-images.env}"

POSTGRES_APPROVED_ENV="${POSTGRES_APPROVED_ENV:-${HOME}/.config/vault-bank/postgres-runtime-approved.env}"

HARBOR_HOST='harbor.vaultbank.internal'
HARBOR_PORT='9443'
HARBOR_REGISTRY="${HARBOR_HOST}:${HARBOR_PORT}"
HARBOR_PROJECT='vault-bank'

HARBOR_CA='/usr/local/share/ca-certificates/vaultbank-harbor-ca.crt'

PUBLISHER_USERNAME_FILE='/etc/harbor/secrets/runtime_publisher_username'
PUBLISHER_TOKEN_FILE='/etc/harbor/secrets/runtime_publisher_token'

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION}}"

export AWS_REGION
export AWS_DEFAULT_REGION

KMS_ALIAS='alias/vaultbank-cosign'

REPORT_ROOT="${ROOT_DIR}/reports/phase-5d-a-runtime-publication"

required_commands=(
  aws
  cosign
  docker
  jq
  python3
  syft
  trivy
)

for command_name in "${required_commands[@]}"; do
  command -v "${command_name}" >/dev/null || {
    echo "FAIL: required command missing: ${command_name}"
    exit 1
  }
done

test -s "${RUNTIME_IMAGE_ENV}" || {
  echo "FAIL: runtime image environment file missing"
  exit 1
}

test -s "${POSTGRES_APPROVED_ENV}" || {
  echo "FAIL: PostgreSQL approval environment missing"
  exit 1
}

test -r "${HARBOR_CA}" || {
  echo "FAIL: Harbor CA is unavailable"
  exit 1
}

sudo -n sudo test -s "${PUBLISHER_USERNAME_FILE}" || {
  echo "FAIL: Harbor publisher username missing"
  exit 1
}

sudo -n sudo test -s "${PUBLISHER_TOKEN_FILE}" || {
  echo "FAIL: Harbor publisher token missing"
  exit 1
}

# shellcheck source=/dev/null
source "${RUNTIME_IMAGE_ENV}"

# shellcheck source=/dev/null
source "${POSTGRES_APPROVED_ENV}"

: "${POSTGRES_RUNTIME_LOCAL_IMAGE:?}"
: "${POSTGRES_RUNTIME_SOURCE_COMMIT:?}"
: "${REDIS_TAG:?}"
: "${REDIS_DIGEST:?}"
: "${RABBITMQ_TAG:?}"
: "${RABBITMQ_DIGEST:?}"

docker image inspect \
  "${POSTGRES_RUNTIME_LOCAL_IMAGE}" \
  >/dev/null || {
    echo "FAIL: approved PostgreSQL local image is unavailable"
    exit 1
  }

SOURCE_COMMIT="${POSTGRES_RUNTIME_SOURCE_COMMIT}"
SOURCE_SHORT="${SOURCE_COMMIT:0:12}"
RELEASE_TAG="phase5d-a-${SOURCE_SHORT}"

POSTGRES_SOURCE="${POSTGRES_RUNTIME_LOCAL_IMAGE}"
REDIS_SOURCE="${REDIS_TAG}@${REDIS_DIGEST}"
RABBITMQ_SOURCE="${RABBITMQ_TAG}@${RABBITMQ_DIGEST}"

POSTGRES_TARGET="${HARBOR_REGISTRY}/${HARBOR_PROJECT}/postgres-runtime:${RELEASE_TAG}"
REDIS_TARGET="${HARBOR_REGISTRY}/${HARBOR_PROJECT}/redis-runtime:${RELEASE_TAG}"
RABBITMQ_TARGET="${HARBOR_REGISTRY}/${HARBOR_PROJECT}/rabbitmq-runtime:${RELEASE_TAG}"

mkdir -p \
  "${REPORT_ROOT}/scan" \
  "${REPORT_ROOT}/sbom" \
  "${REPORT_ROOT}/signature" \
  "${REPORT_ROOT}/attestation" \
  "${REPORT_ROOT}/push"

DOCKER_CONFIG="$(
  mktemp -d /tmp/vaultbank-runtime-docker-config.XXXXXX
)"

cleanup() {
  docker logout \
    "${HARBOR_REGISTRY}" \
    >/dev/null 2>&1 ||
  true

  rm -rf "${DOCKER_CONFIG}"
}

trap cleanup EXIT

export DOCKER_CONFIG

PUBLISHER_USERNAME="$(
  sudo cat "${PUBLISHER_USERNAME_FILE}"
)"

set +x

sudo cat "${PUBLISHER_TOKEN_FILE}" |
docker login \
  "${HARBOR_REGISTRY}" \
  --username "${PUBLISHER_USERNAME}" \
  --password-stdin \
  >/dev/null

echo "PASS: authenticated to Harbor using runtime publisher"

curl \
  --fail \
  --silent \
  --show-error \
  --cacert "${HARBOR_CA}" \
  "https://${HARBOR_REGISTRY}/api/v2.0/ping" \
  | grep -qx 'Pong'

echo "PASS: Harbor API and TLS verification completed"

aws sts get-caller-identity \
  >/dev/null

KMS_KEY_ARN="$(
  aws kms describe-key \
    --region "${AWS_REGION}" \
    --key-id "${KMS_ALIAS}" \
    --query 'KeyMetadata.Arn' \
    --output text
)"

test -n "${KMS_KEY_ARN}" || {
  echo "FAIL: KMS key could not be resolved"
  exit 1
}

KMS_URI="awskms:///${KMS_KEY_ARN}"

cosign public-key \
  --key "${KMS_URI}" \
  > "${REPORT_ROOT}/cosign-kms-public-key.pem"

grep -q \
  'BEGIN PUBLIC KEY' \
  "${REPORT_ROOT}/cosign-kms-public-key.pem"


SIGNING_CONFIG="${REPORT_ROOT}/cosign-signing-config-no-tlog.json"

rm -f "${SIGNING_CONFIG}"

cosign signing-config create \
  --output-file "${SIGNING_CONFIG}"

chmod 0640 "${SIGNING_CONFIG}"

jq -e '
  .mediaType
    == "application/vnd.dev.sigstore.signingconfig.v0.2+json"
  and (
    (.rekorTlogUrls // [])
    | length
  ) == 0
' "${SIGNING_CONFIG}" \
>/dev/null

echo "PASS: Cosign no-transparency-log signing configuration created"

publish_image() {
  local component="$1"
  local source_reference="$2"
  local target_reference="$3"
  local push_log="${REPORT_ROOT}/push/${component}.log"
  local digest

  printf '\n=== Publishing %s ===\n' "${component}"
  printf 'Source: %s\n' "${source_reference}"
  printf 'Target: %s\n' "${target_reference}"

  if [ "${component}" != 'postgres' ]; then
    docker pull \
      "${source_reference}" \
      >/dev/null
  fi

  docker tag \
    "${source_reference}" \
    "${target_reference}"

  docker push \
    "${target_reference}" 2>&1 |
  tee "${push_log}"

  digest="$(
    awk '
      /digest:[[:space:]]+sha256:[0-9a-f]{64}/ {
        value = $0
        sub(/^.*digest:[[:space:]]+/, "", value)
        sub(/[[:space:]].*$/, "", value)
        digest = value
      }
      END {
        if (digest != "") {
          print digest
        }
      }
    ' "${push_log}"
  )"

  printf '%s\n' "${digest}" |
  grep -Eq '^sha256:[0-9a-f]{64}$' || {
    echo "FAIL: registry digest was not resolved"
    exit 1
  }

  PUBLISHED_REFERENCE="${target_reference%:*}@${digest}"

  printf 'Published digest: %s\n' \
    "${PUBLISHED_REFERENCE}"
}

approve_published_image() {
  local component="$1"
  local reference="$2"

  local json_report="${REPORT_ROOT}/scan/${component}.json"
  local table_report="${REPORT_ROOT}/scan/${component}.txt"
  local sbom="${REPORT_ROOT}/sbom/${component}.spdx.json"
  local signature_report="${REPORT_ROOT}/signature/${component}.json"
  local attestation_report="${REPORT_ROOT}/attestation/${component}.json"

  printf '\n=== Harbor security gate: %s ===\n' \
    "${component}"

  trivy image \
    --skip-version-check \
    --scanners vuln,secret,misconfig \
    --format json \
    --output "${json_report}" \
    "${reference}"

  trivy image \
    --skip-version-check \
    --scanners vuln,secret,misconfig \
    --format table \
    --output "${table_report}" \
    "${reference}"

  local critical
  local fixable_high
  local secrets
  local misconfigurations

  critical="$(
    jq '
      [
        .Results[]?.Vulnerabilities[]?
        | select(.Severity == "CRITICAL")
      ]
      | length
    ' "${json_report}"
  )"

  fixable_high="$(
    jq '
      [
        .Results[]?.Vulnerabilities[]?
        | select(
            .Severity == "HIGH"
            and ((.FixedVersion // "") | length) > 0
          )
      ]
      | length
    ' "${json_report}"
  )"

  secrets="$(
    jq '[.Results[]?.Secrets[]?] | length' \
      "${json_report}"
  )"

  misconfigurations="$(
    jq '[.Results[]?.Misconfigurations[]?] | length' \
      "${json_report}"
  )"

  printf 'Critical:          %s\n' "${critical}"
  printf 'Fixable High:      %s\n' "${fixable_high}"
  printf 'Secrets:           %s\n' "${secrets}"
  printf 'Misconfigurations: %s\n' "${misconfigurations}"

  if [ "${critical}" -ne 0 ] ||
     [ "${fixable_high}" -ne 0 ] ||
     [ "${secrets}" -ne 0 ] ||
     [ "${misconfigurations}" -ne 0 ]; then

    echo "FAIL: ${component} Harbor digest failed security policy"

    jq -r '
      .Results[] as $result
      | ($result.Vulnerabilities // [])[]
      | select(
          .Severity == "CRITICAL"
          or (
            .Severity == "HIGH"
            and ((.FixedVersion // "") | length) > 0
          )
        )
      | [
          ($result.Target // "unknown"),
          (.VulnerabilityID // "unknown"),
          (.Severity // "unknown"),
          (.PkgName // "unknown"),
          (.InstalledVersion // "unknown"),
          (.FixedVersion // "unfixed")
        ]
      | @tsv
    ' "${json_report}" || true

    exit 1
  fi

  syft \
    "${reference}" \
    --output spdx-json \
    > "${sbom}"

  jq -e '
    .spdxVersion
    and .documentNamespace
    and (.packages | type == "array")
  ' "${sbom}" \
  >/dev/null

  cosign sign \
    --yes \
    --key "${KMS_URI}" \
    --signing-config "${SIGNING_CONFIG}" \
    --registry-cacert "${HARBOR_CA}" \
    -a project=vault-bank \
    -a phase=phase-5d-a \
    -a component="${component}" \
    -a source-commit="${SOURCE_COMMIT}" \
    "${reference}"

  cosign attest \
    --yes \
    --key "${KMS_URI}" \
    --signing-config "${SIGNING_CONFIG}" \
    --registry-cacert "${HARBOR_CA}" \
    --type 'https://spdx.dev/Document' \
    --predicate "${sbom}" \
    "${reference}"

  cosign verify \
    --key "${REPORT_ROOT}/cosign-kms-public-key.pem" \
    --insecure-ignore-tlog \
    --registry-cacert "${HARBOR_CA}" \
    -a project=vault-bank \
    -a phase=phase-5d-a \
    -a component="${component}" \
    --output json \
    "${reference}" \
    > "${signature_report}"

  cosign verify-attestation \
    --key "${REPORT_ROOT}/cosign-kms-public-key.pem" \
    --insecure-ignore-tlog \
    --registry-cacert "${HARBOR_CA}" \
    --type 'https://spdx.dev/Document' \
    --output json \
    "${reference}" \
    > "${attestation_report}"

  jq -e -s \
    'length > 0 and all(.[]; type == "object" or type == "array")' \
    "${signature_report}" \
    >/dev/null

  jq -e -s \
    'length > 0 and all(.[]; type == "object" or type == "array")' \
    "${attestation_report}" \
    >/dev/null

  echo "PASS: ${component} scanned, SBOM-attested, signed and verified"
}

publish_image \
  postgres \
  "${POSTGRES_SOURCE}" \
  "${POSTGRES_TARGET}"

POSTGRES_HARBOR_REFERENCE="${PUBLISHED_REFERENCE}"

publish_image \
  redis \
  "${REDIS_SOURCE}" \
  "${REDIS_TARGET}"

REDIS_HARBOR_REFERENCE="${PUBLISHED_REFERENCE}"

publish_image \
  rabbitmq \
  "${RABBITMQ_SOURCE}" \
  "${RABBITMQ_TARGET}"

RABBITMQ_HARBOR_REFERENCE="${PUBLISHED_REFERENCE}"

approve_published_image \
  postgres \
  "${POSTGRES_HARBOR_REFERENCE}"

approve_published_image \
  redis \
  "${REDIS_HARBOR_REFERENCE}"

approve_published_image \
  rabbitmq \
  "${RABBITMQ_HARBOR_REFERENCE}"

python3 - \
  "${SOURCE_COMMIT}" \
  "${KMS_KEY_ARN}" \
  "${POSTGRES_SOURCE}" \
  "${POSTGRES_HARBOR_REFERENCE}" \
  "${REDIS_SOURCE}" \
  "${REDIS_HARBOR_REFERENCE}" \
  "${RABBITMQ_SOURCE}" \
  "${RABBITMQ_HARBOR_REFERENCE}" \
  "${REPORT_ROOT}/runtime-publication-manifest.json" \
  <<'PY'
import json
import sys
from pathlib import Path

(
    source_commit,
    kms_key_arn,
    postgres_source,
    postgres_target,
    redis_source,
    redis_target,
    rabbitmq_source,
    rabbitmq_target,
    output_path,
) = sys.argv[1:]

document = {
    "project": "vault-bank",
    "phase": "phase-5d-a",
    "source_commit": source_commit,
    "signing_key": kms_key_arn,
    "images": [
        {
            "component": "postgres",
            "source": postgres_source,
            "harbor_image": postgres_target,
        },
        {
            "component": "redis",
            "source": redis_source,
            "harbor_image": redis_target,
        },
        {
            "component": "rabbitmq",
            "source": rabbitmq_source,
            "harbor_image": rabbitmq_target,
        },
    ],
    "controls": {
        "immutable_digests": True,
        "trivy_gate_passed": True,
        "spdx_sboms_generated": True,
        "kms_signatures_verified": True,
        "spdx_attestations_verified": True,
        "secrets_in_git": False,
    },
}

Path(output_path).write_text(
    json.dumps(document, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
PY

cat > \
  "${REPORT_ROOT}/runtime-images-approved.env" \
  <<APPROVED
POSTGRES_RUNTIME_HARBOR_IMAGE=${POSTGRES_HARBOR_REFERENCE}
REDIS_RUNTIME_HARBOR_IMAGE=${REDIS_HARBOR_REFERENCE}
RABBITMQ_RUNTIME_HARBOR_IMAGE=${RABBITMQ_HARBOR_REFERENCE}
RUNTIME_SOURCE_COMMIT=${SOURCE_COMMIT}
RUNTIME_KMS_KEY_ARN=${KMS_KEY_ARN}
APPROVED

chmod 0640 \
  "${REPORT_ROOT}/runtime-images-approved.env"

find "${REPORT_ROOT}" \
  -type f \
  ! -name 'checksums.sha256' \
  -exec sha256sum {} + \
  > "${REPORT_ROOT}/checksums.sha256"

printf '\n=== Approved runtime images ===\n'
printf 'PostgreSQL: %s\n' "${POSTGRES_HARBOR_REFERENCE}"
printf 'Redis:      %s\n' "${REDIS_HARBOR_REFERENCE}"
printf 'RabbitMQ:   %s\n' "${RABBITMQ_HARBOR_REFERENCE}"

echo
echo "PASS: all runtime images published, signed, attested and verified"
