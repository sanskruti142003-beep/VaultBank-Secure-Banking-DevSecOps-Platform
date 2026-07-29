# Architecture Gap Status

## Notification Service

Status: implemented

`notification-service` is now a deployable NestJS application in the monorepo.
It consumes `notification.queue`, exposes `/v1/health` and `/v1/metrics`, and is
wired into Docker Compose, Vault policy/bootstrap, RabbitMQ definitions, and the
service map.

Current limitation: payment and transaction events do not always include a
recipient email address, so the service logs a structured skipped delivery until
those events are enriched or a customer-profile lookup is added.

## Production Readiness

Status: configured, not automatically promoted

Local Docker Compose remains a development/POC environment. Production must use
the production Vault configuration and the frontend S3/CloudFront stack instead
of treating the EC2 POC as compliant production.
