# Shared infrastructure

The local production-mirrored stack is defined in `docker-compose.yml`.

## Redis

- Redis 7 with password authentication and AOF persistence
- `allkeys-lru` eviction
- DB 0 sessions, DB 1 cache, DB 2 rate limiting, DB 3 OTP
- Atomic rate-limit increment/expiry via Lua

Configuration: `docker/redis/redis.conf`.

## RabbitMQ

- RabbitMQ 3.12 management image
- vhosts: `/banking-dev`, `/banking-staging`, `/banking-prod`
- durable topic exchange `banking.events`
- durable direct dead-letter exchange `banking.events.dlx`
- quorum queues with 24-hour TTL and 100,000-message limit
- Payment queue bindings for `transaction.completed` and
  `transaction.failed`
- per-service resource and topic permissions, including `audit.request`

Configuration: `docker/rabbitmq/rabbitmq.conf` and
`docker/rabbitmq/definitions.json`.

## Vault

Vault 1.15 runs in dev mode locally. The `vault-init` one-shot Compose service
runs `docker/vault/init/vault-init.sh` to create KV v2 secrets, read-only
policies, and AppRoles before app containers start. The generated credentials
are stored in `/vault/init-output/approle-credentials.env`.

If `.env` already contains `*_VAULT_ROLE_ID` and `*_VAULT_SECRET_ID`, the init
script recreates those exact local dev AppRole credentials after a Vault dev
restart. This prevents stale `.env` credentials from causing AppRole `403
permission denied` errors.

Container secrets use independent hostnames:

- PostgreSQL: `postgres`
- Redis: `redis`
- RabbitMQ: `rabbitmq`

Compose always seeds these Docker-internal hostnames into Vault even if your
local `.env` uses `127.0.0.1` for running Nest directly on the host.

Production reference configuration is
`docker/vault/config/vault.production.hcl`; never use Vault dev mode outside
local development.

## Startup order

1. PostgreSQL, Redis, RabbitMQ, and Vault become healthy.
2. `vault-init` creates secrets, policies, and AppRoles.
3. TypeORM migrations run with dedicated migrator roles.
4. Each Nest service authenticates to Vault via AppRole.
5. It verifies Redis, RabbitMQ, then PostgreSQL.
6. Nest creates long-lived clients and starts its HTTP listener.

Application services fail closed if a dependency or required Vault secret is
unavailable.

## Nginx API gateway

Nginx is attached to `banking-network` and is the only container publishing
application traffic to non-loopback host interfaces. The four NestJS ports are
exposed only inside the bridge network.

The gateway provides:

- HTTP-to-HTTPS redirect and local self-signed TLS
- route-specific IP and bearer-token rate limiting
- explicit-origin CORS and preflight handling
- JSON error responses and JSON access logs
- security headers, 10 MB request limits, and upstream timeouts
- public gateway/service health checks
- hard JSON 403 responses for `/internal` and `/internal/*`
- unbuffered Stripe and PayPal webhook forwarding
- request and correlation ID propagation

Configuration, test commands, and production guidance are under `nginx/`.
