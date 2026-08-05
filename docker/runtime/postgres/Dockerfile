# syntax=docker/dockerfile:1.7

ARG GO_BUILDER_IMAGE
ARG POSTGRES_BASE_IMAGE

FROM ${GO_BUILDER_IMAGE} AS gosu-builder

ARG GOSU_REPOSITORY
ARG GOSU_VERSION
ARG GOSU_COMMIT
ARG TARGETOS=linux
ARG TARGETARCH=amd64

ENV CGO_ENABLED=0

RUN set -eux; \
    apt-get update; \
    apt-get install -y \
      --no-install-recommends \
      ca-certificates \
      git; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src

RUN set -eux; \
    test -n "${GOSU_REPOSITORY}"; \
    test -n "${GOSU_VERSION}"; \
    test -n "${GOSU_COMMIT}"; \
    git init; \
    git remote add origin "${GOSU_REPOSITORY}"; \
    git fetch \
      --depth 1 \
      origin \
      "refs/tags/${GOSU_VERSION}:refs/tags/${GOSU_VERSION}"; \
    git checkout \
      --detach \
      "${GOSU_COMMIT}"; \
    test "$(git rev-parse HEAD)" = "${GOSU_COMMIT}"

RUN set -eux; \
    grep -Eq \
      'const Version = "1[.]19"' \
      version.go; \
    go mod download; \
    go mod verify; \
    GOOS="${TARGETOS}" \
    GOARCH="${TARGETARCH}" \
    go build \
      -mod=readonly \
      -trimpath \
      -buildvcs=false \
      -ldflags='-d -w' \
      -o /out/gosu \
      .; \
    /out/gosu --version; \
    /out/gosu nobody true; \
    go version -m /out/gosu

FROM ${POSTGRES_BASE_IMAGE} AS runtime

ARG GOSU_VERSION
ARG GOSU_COMMIT
ARG GO_VERSION
ARG POSTGRES_BASE_DIGEST
ARG SOURCE_COMMIT

LABEL org.opencontainers.image.title="Vault Bank PostgreSQL Runtime"
LABEL org.opencontainers.image.description="PostgreSQL runtime with rebuilt gosu and non-root UID 1000"
LABEL org.opencontainers.image.source="https://github.com/sonappatil/vault_bank"
LABEL org.opencontainers.image.revision="${SOURCE_COMMIT}"
LABEL vault-bank.postgres.base-digest="${POSTGRES_BASE_DIGEST}"
LABEL vault-bank.gosu.version="${GOSU_VERSION}"
LABEL vault-bank.gosu.commit="${GOSU_COMMIT}"
LABEL vault-bank.gosu.go-version="${GO_VERSION}"

USER root

COPY --from=gosu-builder \
  --chown=0:0 \
  /out/gosu \
  /usr/local/bin/gosu

RUN set -eux; \
    chmod 0755 /usr/local/bin/gosu; \
    /usr/local/bin/gosu --version; \
    /usr/local/bin/gosu nobody true; \
    awk \
      -F: \
      'BEGIN { OFS = FS } $1 == "postgres" { $3 = 1000; $4 = 1000 } { print }' \
      /etc/passwd \
      > /tmp/passwd; \
    cat /tmp/passwd > /etc/passwd; \
    rm -f /tmp/passwd; \
    awk \
      -F: \
      'BEGIN { OFS = FS } $1 == "postgres" { $3 = 1000 } { print }' \
      /etc/group \
      > /tmp/group; \
    cat /tmp/group > /etc/group; \
    rm -f /tmp/group; \
    mkdir -p \
      /var/lib/postgresql/data \
      /var/run/postgresql \
      /tmp; \
    chown -R \
      1000:1000 \
      /var/lib/postgresql \
      /var/run/postgresql; \
    chmod 0700 /var/lib/postgresql/data; \
    chmod 0775 /var/run/postgresql; \
    chmod 1777 /tmp; \
    test "$(id -u postgres)" = "1000"; \
    test "$(id -g postgres)" = "1000"

USER 1000:1000

HEALTHCHECK \
  --interval=10s \
  --timeout=5s \
  --start-period=30s \
  --retries=6 \
  CMD pg_isready \
    -U "${POSTGRES_USER:-postgres}" \
    -d "${POSTGRES_DB:-postgres}" \
    || exit 1
