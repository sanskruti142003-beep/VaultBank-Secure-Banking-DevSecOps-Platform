# Architecture Gaps

## Notification Service

Status: planned

The infrastructure reserves Vault, RabbitMQ, and dead-letter queue settings for
`notification-service`, but there is no deployable NestJS application for it in
the current monorepo.

Phase 1 treats notification delivery as an architecture gap rather than a
pipeline-blocking service. Add it to `config/service-map.txt` only after the
service has a real `backend-service/apps/notification-service` project,
Docker build target, health endpoint, metrics endpoint, and structured stdout
logging.

Current notification-related behavior is handled inside existing services, such
as auth OTP email and payment OTP email.
