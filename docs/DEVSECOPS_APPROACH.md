# VaultBank DevSecOps Approach

## Target posture

The current EC2 deployment is a development/POC environment until production
controls are enabled. The production target is:

- Build every NestJS service as an immutable container image.
- Serve the React frontend from private S3 through CloudFront.
- Use Vault production mode with TLS, persistent storage, AppRole, and auto
  unseal.
- Keep secrets out of Git, images, logs, and CI output.
- Block releases when tests, dependency scans, secret scans, image scans, or
  infrastructure validation fail.
- Emit structured logs, audit events, health checks, and Prometheus metrics for
  every deployable service.

## Implementation phases

| Phase | Goal | Required gates |
| --- | --- | --- |
| 1 | Repository readiness | service map, Dockerfiles, health, metrics, secret scan |
| 2 | CI security baseline | unit tests, build, lint/typecheck, dependency audit, SBOM |
| 3 | Container security | image scan, non-root runtime, signed image, pinned base images |
| 4 | Infrastructure security | Terraform plan, policy checks, private frontend bucket, production Vault |
| 5 | Release and monitoring | deployment approval, smoke tests, metrics, audit logs, alerts |

## Dataflow Diagram

```mermaid
flowchart LR
  Dev["Developer"] --> Git["Git repository"]
  Git --> CI["CI pipeline"]

  CI --> Validate["Repository validator"]
  CI --> Tests["Tests and type checks"]
  CI --> Scans["Secret, dependency, IaC, and image scans"]
  CI --> Build["Build artifacts"]

  Build --> Images["Backend container images"]
  Build --> FrontendDist["Frontend dist bundle"]

  Images --> Registry["Container registry"]
  FrontendDist --> S3["Private S3 frontend bucket"]
  S3 --> CloudFront["CloudFront CDN"]

  Registry --> Runtime["EC2 or container runtime"]
  Runtime --> Nginx["Nginx API gateway"]
  Nginx --> Auth["Auth service"]
  Nginx --> Account["Account service"]
  Nginx --> Transaction["Transaction service"]
  Nginx --> Payment["Payment service"]
  Nginx --> Notification["Notification service"]

  Auth --> RabbitMQ["RabbitMQ banking.events"]
  Account --> RabbitMQ
  Transaction --> RabbitMQ
  Payment --> RabbitMQ
  RabbitMQ --> Notification

  Auth --> Vault["Vault production mode"]
  Account --> Vault
  Transaction --> Vault
  Payment --> Vault
  Notification --> Vault

  Auth --> Postgres["PostgreSQL"]
  Account --> Postgres
  Transaction --> Postgres
  Payment --> Postgres

  Auth --> Redis["Redis"]
  Account --> Redis
  Transaction --> Redis
  Payment --> Redis
  Notification --> Redis

  Runtime --> Logs["Structured JSON logs"]
  Runtime --> Metrics["/v1/metrics Prometheus endpoints"]
  Logs --> Alerts["Monitoring and alerts"]
  Metrics --> Alerts
```

## Recommended pipeline gates

1. Validate repository shape with `ci/scripts/validate-repository.sh`.
2. Build backend with `npm run build:all` from `backend-service`.
3. Build frontend with `npm run build` from `frontend`.
4. Run dependency and secret scans before image publishing.
5. Build one image per backend service using the shared Dockerfile and
   `SERVICE_NAME`.
6. Scan images before pushing to the registry.
7. Apply Terraform through reviewed plans only.
8. Deploy to staging, run smoke checks on `/health/*` and `/metrics/*`, then
   promote to production after approval.
