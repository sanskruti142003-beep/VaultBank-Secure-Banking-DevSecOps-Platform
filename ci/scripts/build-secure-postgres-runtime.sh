#!/usr/bin/env bash

set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &&
  pwd
)"

ROOT_DIR="$(
  cd -- "${SCRIPT_DIR}/../.." &&
  pwd
)"

DOCKERFILE="${ROOT_DIR}/docker/runtime/postgres/Dockerfile"

RUNTIME_IMAGE_ENV="${RUNTIME_IMAGE_ENV:-${HOME}/.config/vault-bank/runtime-images.env}"

REPORT_DIR="${ROOT_DIR}/reports/phase-5d-a-runtime-images/postgres"

GO_VERSION='1.26.5'
GO_BUILDER_TAG="docker.io/library/golang:${GO_VERSION}-trixie"

GOSU_REPOSITORY='https://github.com/tianon/gosu.git'
GOSU_VERSION='1.19'

PLATFORM='linux/amd64'

required_commands=(
  docker
  git
  jq
  openssl
  syft
  trivy
)

for command_name in "${required_commands[@]}"; do
  command -v "${command_name}" >/dev/null || {
    echo "FAIL: required command missing: ${command_name}"
    exit 1
  }
done

test -s "${DOCKERFILE}" || {
  echo "FAIL: Dockerfile missing: ${DOCKERFILE}"
  exit 1
}

test -s "${RUNTIME_IMAGE_ENV}" || {
  echo "FAIL: runtime image environment file missing"
  exit 1
}

# shellcheck source=/dev/null
source "${RUNTIME_IMAGE_ENV}"

: "${POSTGRES_TAG:?POSTGRES_TAG is required}"
: "${POSTGRES_DIGEST:?POSTGRES_DIGEST is required}"

printf '%s\n' "${POSTGRES_DIGEST}" |
grep -Eq '^sha256:[0-9a-f]{64}$' || {
  echo "FAIL: invalid PostgreSQL base digest"
  exit 1
}

resolve_digest() {
  local image="$1"
  local digest

  digest="$(
    docker buildx imagetools inspect \
      "${image}" |
    awk '$1 == "Digest:" { print $2; exit }'
  )"

  printf '%s\n' "${digest}" |
  grep -Eq '^sha256:[0-9a-f]{64}$' || {
    echo "FAIL: unable to resolve digest for ${image}" >&2
    exit 1
  }

  printf '%s' "${digest}"
}

GO_BUILDER_DIGEST="$(
  resolve_digest "${GO_BUILDER_TAG}"
)"

GO_BUILDER_REFERENCE="${GO_BUILDER_TAG}@${GO_BUILDER_DIGEST}"

POSTGRES_BASE_REFERENCE="${POSTGRES_TAG}@${POSTGRES_DIGEST}"

GOSU_COMMIT="$(
  {
    git ls-remote \
      "${GOSU_REPOSITORY}" \
      "refs/tags/${GOSU_VERSION}^{}"

    git ls-remote \
      --refs \
      "${GOSU_REPOSITORY}" \
      "refs/tags/${GOSU_VERSION}"
  } |
  awk 'NR == 1 { print $1 }'
)"

printf '%s\n' "${GOSU_COMMIT}" |
grep -Eq '^[0-9a-f]{40}$' || {
  echo "FAIL: unable to resolve gosu source commit"
  exit 1
}

cd "${ROOT_DIR}"

SOURCE_COMMIT="$(
  git rev-parse HEAD
)"

SOURCE_SHORT="$(
  git rev-parse --short=12 HEAD
)"

LOCAL_IMAGE="vaultbank/postgres-runtime:phase5d-a-${SOURCE_SHORT}-local"

mkdir -p "${REPORT_DIR}"

printf '\n=== Build inputs ===\n'
printf 'PostgreSQL base: %s\n' "${POSTGRES_BASE_REFERENCE}"
printf 'Go builder:     %s\n' "${GO_BUILDER_REFERENCE}"
printf 'gosu version:   %s\n' "${GOSU_VERSION}"
printf 'gosu commit:    %s\n' "${GOSU_COMMIT}"
printf 'Source commit:  %s\n' "${SOURCE_COMMIT}"
printf 'Local image:    %s\n' "${LOCAL_IMAGE}"

docker buildx build \
  --platform "${PLATFORM}" \
  --pull \
  --load \
  --file "${DOCKERFILE}" \
  --tag "${LOCAL_IMAGE}" \
  --build-arg "GO_BUILDER_IMAGE=${GO_BUILDER_REFERENCE}" \
  --build-arg "POSTGRES_BASE_IMAGE=${POSTGRES_BASE_REFERENCE}" \
  --build-arg "GOSU_REPOSITORY=${GOSU_REPOSITORY}" \
  --build-arg "GOSU_VERSION=${GOSU_VERSION}" \
  --build-arg "GOSU_COMMIT=${GOSU_COMMIT}" \
  --build-arg "GO_VERSION=${GO_VERSION}" \
  --build-arg "POSTGRES_BASE_DIGEST=${POSTGRES_DIGEST}" \
  --build-arg "SOURCE_COMMIT=${SOURCE_COMMIT}" \
  "${ROOT_DIR}" |
tee "${REPORT_DIR}/docker-build.log"

CONFIGURED_USER="$(
  docker image inspect \
    --format '{{.Config.User}}' \
    "${LOCAL_IMAGE}"
)"

printf 'Configured image user: %s\n' \
  "${CONFIGURED_USER}"

test "${CONFIGURED_USER}" = '1000:1000' || {
  echo "FAIL: image does not default to UID/GID 1000"
  exit 1
}

GOSU_VERSION_OUTPUT="$(
  docker run \
    --rm \
    --entrypoint /usr/local/bin/gosu \
    "${LOCAL_IMAGE}" \
    --version
)"

printf 'gosu output: %s\n' \
  "${GOSU_VERSION_OUTPUT}"

printf '%s\n' "${GOSU_VERSION_OUTPUT}" |
grep -F '1.19' >/dev/null || {
  echo "FAIL: gosu version mismatch"
  exit 1
}

printf '%s\n' "${GOSU_VERSION_OUTPUT}" |
grep -F "go${GO_VERSION}" >/dev/null || {
  echo "FAIL: gosu was not built with Go ${GO_VERSION}"
  exit 1
}

TEST_CONTAINER="vaultbank-postgres-runtime-test-${SOURCE_SHORT}"
TEST_VOLUME="vaultbank-postgres-runtime-test-${SOURCE_SHORT}"
TEST_PASSWORD="$(
  openssl rand -hex 24
)"

cleanup_test() {
  docker rm \
    --force \
    "${TEST_CONTAINER}" \
    >/dev/null 2>&1 ||
  true

  docker volume rm \
    "${TEST_VOLUME}" \
    >/dev/null 2>&1 ||
  true
}

trap cleanup_test EXIT

cleanup_test

docker volume create \
  "${TEST_VOLUME}" \
  >/dev/null

docker run \
  --detach \
  --name "${TEST_CONTAINER}" \
  --user 1000:1000 \
  --read-only \
  --tmpfs \
    /tmp:rw,noexec,nosuid,nodev,uid=1000,gid=1000,mode=1777 \
  --tmpfs \
    /var/run/postgresql:rw,nosuid,nodev,uid=1000,gid=1000,mode=0775 \
  --env "POSTGRES_PASSWORD=${TEST_PASSWORD}" \
  --env POSTGRES_USER=postgres \
  --env POSTGRES_DB=postgres \
  --volume \
    "${TEST_VOLUME}:/var/lib/postgresql/data" \
  "${LOCAL_IMAGE}" \
  >/dev/null

READY=0

for ((attempt = 1; attempt <= 90; attempt++)); do
  printf 'Waiting for PostgreSQL readiness: attempt %d/90\n' \
    "${attempt}"

  if docker exec \
    "${TEST_CONTAINER}" \
    pg_isready \
      --username postgres \
      --dbname postgres \
      >/dev/null 2>&1; then

    READY=1
    break
  fi

  if [ "$(
    docker inspect \
      --format '{{.State.Running}}' \
      "${TEST_CONTAINER}" \
      2>/dev/null ||
    echo false
  )" != 'true' ]; then
    break
  fi

  sleep 2
done

if [ "${READY}" -ne 1 ]; then
  docker logs "${TEST_CONTAINER}" || true
  echo "FAIL: PostgreSQL functional test did not become ready"
  exit 1
fi

docker exec \
  "${TEST_CONTAINER}" \
  sh -ec '
    test "$(id -u)" = "1000"
    test "$(id -g)" = "1000"
  '

SQL_RESULT="$(
  docker exec \
    --env "PGPASSWORD=${TEST_PASSWORD}" \
    "${TEST_CONTAINER}" \
    psql \
      --host 127.0.0.1 \
      --username postgres \
      --dbname postgres \
      --tuples-only \
      --no-align \
      --command 'SELECT 1;'
)"

test "${SQL_RESULT}" = '1' || {
  echo "FAIL: PostgreSQL SQL functional test failed"
  exit 1
}

echo "PASS: PostgreSQL starts with UID 1000 and read-only root filesystem"

cleanup_test
trap - EXIT

TRIVY_JSON="${REPORT_DIR}/trivy.json"
TRIVY_TABLE="${REPORT_DIR}/trivy.txt"

trivy image \
  --skip-version-check \
  --scanners vuln,secret,misconfig \
  --format json \
  --output "${TRIVY_JSON}" \
  "${LOCAL_IMAGE}"

trivy image \
  --skip-version-check \
  --scanners vuln,secret,misconfig \
  --format table \
  --output "${TRIVY_TABLE}" \
  "${LOCAL_IMAGE}"

CRITICAL="$(
  jq '
    [
      .Results[]?.Vulnerabilities[]?
      | select(.Severity == "CRITICAL")
    ]
    | length
  ' "${TRIVY_JSON}"
)"

FIXABLE_HIGH="$(
  jq '
    [
      .Results[]?.Vulnerabilities[]?
      | select(
          .Severity == "HIGH"
          and (
            (.FixedVersion // "")
            | length
          ) > 0
        )
    ]
    | length
  ' "${TRIVY_JSON}"
)"

SECRETS="$(
  jq '
    [
      .Results[]?.Secrets[]?
    ]
    | length
  ' "${TRIVY_JSON}"
)"

MISCONFIGURATIONS="$(
  jq '
    [
      .Results[]?.Misconfigurations[]?
    ]
    | length
  ' "${TRIVY_JSON}"
)"

printf '\n=== Security policy ===\n'
printf 'Critical:          %s\n' "${CRITICAL}"
printf 'Fixable High:      %s\n' "${FIXABLE_HIGH}"
printf 'Secrets:           %s\n' "${SECRETS}"
printf 'Misconfigurations: %s\n' "${MISCONFIGURATIONS}"

if [ "${CRITICAL}" -ne 0 ] ||
   [ "${FIXABLE_HIGH}" -ne 0 ] ||
   [ "${SECRETS}" -ne 0 ] ||
   [ "${MISCONFIGURATIONS}" -ne 0 ]; then

  echo
  echo "=== Blocking findings ==="

  jq -r '
    .Results[] as $result
    | ($result.Vulnerabilities // [])[]
    | select(
        .Severity == "CRITICAL"
        or (
          .Severity == "HIGH"
          and (
            (.FixedVersion // "")
            | length
          ) > 0
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
  ' "${TRIVY_JSON}" || true

  jq -r '
    .Results[] as $result
    | ($result.Misconfigurations // [])[]
    | [
        ($result.Target // "unknown"),
        (.ID // "unknown"),
        (.Severity // "unknown"),
        (.Title // "unknown")
      ]
    | @tsv
  ' "${TRIVY_JSON}" || true

  echo "FAIL: secure PostgreSQL image failed security policy"
  exit 1
fi

SBOM="${REPORT_DIR}/postgres-runtime.spdx.json"

syft \
  "${LOCAL_IMAGE}" \
  --output spdx-json \
  > "${SBOM}"

jq -e '
  .spdxVersion
  and .documentNamespace
  and (.packages | type == "array")
' "${SBOM}" \
>/dev/null

sha256sum \
  "${SBOM}" \
  "${TRIVY_JSON}" \
  "${DOCKERFILE}" \
  > "${REPORT_DIR}/checksums.sha256"

cat > \
  /tmp/vault-bank-postgres-runtime-approved.env \
  <<APPROVED
POSTGRES_RUNTIME_LOCAL_IMAGE=${LOCAL_IMAGE}
POSTGRES_RUNTIME_BASE_REFERENCE=${POSTGRES_BASE_REFERENCE}
POSTGRES_RUNTIME_GO_BUILDER_REFERENCE=${GO_BUILDER_REFERENCE}
POSTGRES_RUNTIME_GOSU_VERSION=${GOSU_VERSION}
POSTGRES_RUNTIME_GOSU_COMMIT=${GOSU_COMMIT}
POSTGRES_RUNTIME_SOURCE_COMMIT=${SOURCE_COMMIT}
POSTGRES_RUNTIME_SBOM=${SBOM}
POSTGRES_RUNTIME_TRIVY_REPORT=${TRIVY_JSON}
APPROVED

chmod 0640 \
  /tmp/vault-bank-postgres-runtime-approved.env \
  "${REPORT_DIR}"/*

echo
echo "PASS: secure PostgreSQL runtime image approved locally"
echo "Approved environment: /tmp/vault-bank-postgres-runtime-approved.env"
