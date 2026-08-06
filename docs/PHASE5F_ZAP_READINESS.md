# Phase 5F ZAP Readiness

This phase prepares staging for authenticated OWASP ZAP without weakening auth,
rate limiting, routing, or database isolation.

## What Changed

- `/v1/health` is process liveness only.
- `/v1/ready` checks runtime configuration, PostgreSQL connectivity, required
  schema/table existence, Redis, RabbitMQ, and Vault.
- Staging backend readiness probes use `/v1/ready`.
- Argo CD runs database migrations before application Deployments.
- A dedicated non-admin ZAP staging customer is seeded from protected secrets.
- Explicit Traefik Ingress rules route API paths before the frontend catch-all.
- Backend NetworkPolicies allow Traefik only to required public service ports.
- Audit logging records the final response status after exception filters run.
- Non-HTTP exceptions return a generic 500 response without SQL details.

## Required Protected Values

Create or sync these values from Vault/Jenkins into existing protected runtime
secrets before Argo CD sync:

```text
AUTH_MIGRATOR_PASSWORD
ACCOUNT_MIGRATOR_PASSWORD
TRANSACTION_MIGRATOR_PASSWORD
PAYMENT_MIGRATOR_PASSWORD
ZAP_CUSTOMER_USERNAME
ZAP_CUSTOMER_EMAIL
ZAP_CUSTOMER_PASSWORD
```

The `zap-staging-customer` Kubernetes Secret must contain only:

```text
ZAP_CUSTOMER_USERNAME
ZAP_CUSTOMER_EMAIL
ZAP_CUSTOMER_PASSWORD
ZAP_CUSTOMER_FULL_NAME
```

Do not commit these values to Git.

## Migration Images

The staging migration Job runs four sequential init containers using the already
pinned service images:

```text
auth-service
account-service
transaction-service
payment-service
```

Each init container executes the compiled TypeORM CLI data source for only its
own database. This keeps the existing Jenkins six-image evidence gate stable and
avoids introducing an unpushed placeholder image into Argo CD.

`backend-service/Dockerfile.ec2` also provides a `migrator` target for a future
dedicated migrator image if you later decide to widen the Jenkins evidence
contract from six images to seven:

```bash
docker build \
  --file backend-service/Dockerfile.ec2 \
  --target migrator \
  --tag harbor.vaultbank.internal:9443/vault-bank/database-migrator:${BUILD_TAG} \
  backend-service

docker push harbor.vaultbank.internal:9443/vault-bank/database-migrator:${BUILD_TAG}
docker inspect --format='{{index .RepoDigests 0}}' \
  harbor.vaultbank.internal:9443/vault-bank/database-migrator:${BUILD_TAG}
```

Do not switch GitOps to the dedicated migrator image until Jenkins also builds,
scans, signs, attests, publishes, and verifies that image by immutable digest.

## Validation

```bash
npm run build:all
npm test
npm run test:cov:all
kubectl kustomize gitops/overlays/staging
trivy config --severity HIGH,CRITICAL --exit-code 1 gitops
bash ci/scripts/phase5f-a1a-zap-auth-discovery.sh
```

Expected staging checks:

```bash
curl -k https://staging.vaultbank.internal/v1/health
curl -k https://staging.vaultbank.internal/v1/ready
curl -k -X POST https://staging.vaultbank.internal/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"zap.invalid.customer","password":"InvalidPassword1","role":"customer"}'
```

The invalid login must return `401`, not `405`, `429`, or `500`.
