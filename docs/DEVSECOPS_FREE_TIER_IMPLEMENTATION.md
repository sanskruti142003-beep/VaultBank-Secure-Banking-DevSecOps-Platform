# VaultBank DevSecOps Free Tier Implementation

This guide preserves the banking-grade flow while replacing paid production
building blocks with AWS Free Tier POC substitutes.

## AWS Free Tier Deployment Map

| Capability | Production-grade target | Free Tier POC substitute | POC-safe note |
| --- | --- | --- | --- |
| Kubernetes | EKS private cluster | Single-node k3s on EC2 | POC-safe only; no control-plane HA |
| Registry | Harbor/private registry | Amazon ECR | Use immutable tags and lifecycle retention |
| Database | RDS Multi-AZ encrypted | One small RDS PostgreSQL instance with schemas | POC-safe only; Multi-AZ can cost money |
| Redis | ElastiCache HA | One ElastiCache node if eligible, otherwise self-host Redis | Self-hosted Redis is POC-safe only |
| Frontend | S3 + CloudFront + WAF | S3 + CloudFront, no AWS WAF by default | Use NGINX ModSecurity CRS as free substitute |
| SAST | SonarQube HA | SonarCloud, or SonarQube only if EC2 RAM permits | SonarCloud recommended |
| GitOps | Argo CD on EKS | Argo CD on k3s | Keep replicas at 1 |
| Observability | Managed or HA stack | Prometheus/Grafana/ELK on EC2 only when needed | Stop when not testing |
| Cost guardrail | Organization budgets | AWS Budgets at 1, 10, 40 USD | Confirm budget email subscriptions |

## Phased Implementation Checklist

### Phase 1: Repository Readiness

Files:

- `config/service-map.txt`
- `ci/scripts/validate-repository.sh`
- `ci/scripts/phase-01-readiness.sh`
- `.gitignore`
- `.gitattributes`

Verify:

```bash
bash ci/scripts/validate-repository.sh
bash ci/scripts/phase-01-readiness.sh
```

Fails when:

- A service listed in `config/service-map.txt` lacks a Dockerfile, app folder,
  health path, or metrics path.
- Secret-like files or key headers are tracked.
- Runtime health/metrics endpoints fail when the gateway is up.

Free Tier note: run the runtime checks only when EC2 is started and Docker/k3s
services are actually running.

### Phase 2: CI Baseline

Files:

- `.github/workflows/devsecops.yml`
- `Jenkinsfile`
- `.github/CODEOWNERS`
- `.github/PULL_REQUEST_TEMPLATE/devsecops.md`

Verify:

```bash
cd backend-service
npm ci --legacy-peer-deps
npx eslint "{apps,libs,test}/**/*.ts" --max-warnings=0
npm run build:all
npm test

cd ../frontend
npm ci
npm run typecheck
npm run build
```

Fails when:

- Unit tests fail.
- Backend coverage drops below 80 percent globally in Jenkins.
- Frontend typecheck or build fails.
- PR lacks required reviewers/status checks in GitHub branch protection.

### Phase 3: Security Gates

Files:

- `ci/scripts/run-trufflehog.sh`
- `ci/scripts/run-sonar.sh`
- `ci/scripts/run-dependency-check.sh`
- `ci/scripts/run-trivy-fs.sh`

Order:

1. TruffleHog repository and full history secret scan.
2. SonarCloud/SonarQube SAST quality gate.
3. OWASP Dependency-Check SCA with CVSS threshold 7.
4. Trivy filesystem/config scan for high/critical findings.

Verify:

```bash
bash ci/scripts/run-trufflehog.sh
SONAR_TOKEN=... SONAR_PROJECT_KEY=... bash ci/scripts/run-sonar.sh
NVD_API_KEY=... bash ci/scripts/run-dependency-check.sh
bash ci/scripts/run-trivy-fs.sh
```

Fails when:

- Any verified or unknown secret is found.
- Sonar quality gate fails.
- Dependency-Check finds CVSS >= 7.
- Trivy finds high/critical vulnerability, secret, or config issue.

### Phase 4: Container Security

Files:

- `backend-service/Dockerfile`
- `frontend/Dockerfile`
- `backend-service/nginx/Dockerfile`
- `ci/scripts/build-images.sh`
- `ci/scripts/scan-images.sh`

Verify:

```bash
AWS_ACCOUNT_ID=123456789012 AWS_REGION=us-east-1 bash ci/scripts/build-images.sh
bash ci/scripts/scan-images.sh
```

Fails when:

- Any service image fails to build.
- Trivy image scan finds high/critical findings.

Free Tier note: building all images on a tiny EC2 instance is slow. Use a swap
file and stop other stacks while building.

### Phase 5: SBOM, Signing, Registry

Files:

- `ci/scripts/publish-images-ecr.sh`
- `ci/scripts/sbom-sign-verify.sh`
- `infra/aws-free-tier/*`

Verify:

```bash
AWS_ACCOUNT_ID=123456789012 AWS_REGION=us-east-1 bash ci/scripts/publish-images-ecr.sh
COSIGN_KEY=/secure/path/cosign.key bash ci/scripts/sbom-sign-verify.sh
```

Fails when:

- ECR login or repository creation fails.
- Any image is unsigned.
- Cosign verification fails.
- SBOM generation fails.

Free Tier note: ECR storage can cost money after free allowances. The Terraform
lifecycle policy keeps only the latest 10 images per repo.

### Phase 6: GitOps and k3s Deployment

Files:

- `gitops/base/*`
- `gitops/overlays/staging/*`
- `gitops/overlays/prod/*`
- `gitops/argocd/*`
- `ci/scripts/update-gitops-images.sh`

Verify:

```bash
kustomize build gitops/overlays/staging
kustomize build gitops/overlays/prod
kubectl apply -k gitops/overlays/staging
kubectl -n vaultbank-staging get pods
```

Fails when:

- Kustomize cannot render.
- Required runtime secret `banking-runtime-secrets` is missing.
- Pods fail readiness/liveness probes.
- Argo CD application is degraded or out of sync.

### Phase 7: DAST and Vulnerability Management

Files:

- `ci/scripts/run-zap.sh`
- `ci/scripts/import-defectdojo.sh`
- `security/zap/`
- `security/defectdojo/`

Verify:

```bash
GATEWAY_BASE_URL=https://ec2-public-dns:30443 bash ci/scripts/smoke-gateway.sh
ZAP_TARGET_URL=https://ec2-public-dns:30443 bash ci/scripts/run-zap.sh
DEFECTDOJO_URL=https://defectdojo.example.com DEFECTDOJO_TOKEN=... bash ci/scripts/import-defectdojo.sh
```

Fails when:

- Smoke health/metrics endpoints fail.
- ZAP reports high-risk release-blocking findings.
- DefectDojo import fails.

### Phase 8: Runtime Security and Edge

Files:

- `backend-service/docker/vault/policies/*.hcl`
- `backend-service/nginx/conf.d/*.conf`
- `gitops/base/runtime-config.yaml`

Verify:

```bash
curl -k https://127.0.0.1/health/auth
curl -k https://127.0.0.1/metrics/auth
```

Fails when:

- A service starts with static secrets baked into image/env files committed to Git.
- A service can be reached without NGINX when exposed outside the cluster.
- Security headers, rate limits, or TLS checks regress.

POC-safe item: current k3s manifests use a Kubernetes runtime secret to pass
Vault AppRole data. Production-grade Kubernetes auth with Vault Agent injector
should replace this before real banking use.

### Phase 9: Observability

Files:

- `observability/prometheus/*`
- `observability/grafana/*`
- `observability/alertmanager/*`
- `observability/filebeat/*`

Verify:

```bash
kubectl -n monitoring get pods
kubectl -n vaultbank-staging get endpoints
```

Fails when:

- Prometheus has no `vaultbank-services` targets.
- Alerts do not route to email/Slack.
- Service logs are not enriched with Kubernetes metadata.

Free Tier note: ELK is memory-heavy. Run it only during learning/testing, or use
lighter Loki/Promtail for POC.

### Phase 10: Backup and Cost Safety

Files:

- `ci/scripts/create-aws-budget-alerts.sh`
- `infra/aws-free-tier/*`
- `docs/runbooks/EC2_UBUNTU_POC_DEPLOYMENT.md`
- `docs/runbooks/ROLLBACK_AND_INCIDENT_RESPONSE.md`

Verify:

```bash
AWS_ACCOUNT_ID=123456789012 BUDGET_EMAIL=you@example.com bash ci/scripts/create-aws-budget-alerts.sh
aws budgets describe-budgets --account-id 123456789012
```

Fails when:

- Budgets are missing.
- RDS snapshots/backups are not configured.
- EC2 is left running when not in use.

## Security Gate Thresholds

| Gate | Blocking threshold |
| --- | --- |
| TruffleHog | Any verified or unknown result |
| Sonar | Quality gate must pass |
| Dependency-Check | CVSS >= 7 |
| Trivy FS | HIGH or CRITICAL |
| Trivy image | HIGH or CRITICAL |
| ZAP | High-risk findings block release |
| DefectDojo | Open critical/high findings block prod |
| Coverage | 80 percent global branches/functions/lines/statements |

## Production-Grade Items That Are POC-Safe Only

- Single-node k3s on EC2.
- Self-hosted Redis/RabbitMQ/Vault on one instance.
- Kubernetes Secret carrying Vault AppRole credentials.
- Self-signed local gateway TLS certificates.
- NodePort exposure for staging/prod namespaces.
- Single RDS instance instead of Multi-AZ.
- Running Jenkins, Argo CD, DefectDojo, and observability on the same EC2 host.
