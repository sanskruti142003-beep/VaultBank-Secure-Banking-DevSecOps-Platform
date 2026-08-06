# Vault Bank DevSecOps Phases 1-10

The first ten phases end at signed Harbor image digests. Argo CD, Kubernetes/k3s, ZAP, DefectDojo, production deployment, and monitoring start after this handoff.

## Phase Map

| Phase | Gate | Files / Scripts |
| --- | --- | --- |
| 1 | GitHub repository contract | `README.md`, `.github/CODEOWNERS`, `.github/pull_request_template.md`, `config/service-map.txt` |
| 2 | Jenkins foundation | `Jenkinsfile`, `config/tool-versions.env`, `ci/scripts/jenkins-preflight.sh` |
| 3 | TruffleHog secrets | `ci/scripts/run-trufflehog.sh` |
| 4 | SonarQube/SonarCloud SAST | `sonar-project.properties`, `ci/scripts/configure-sonar-quality-gate.sh`, `ci/scripts/run-sonar.sh` |
| 5 | OWASP Dependency-Check | `ci/scripts/run-dependency-check.sh`, `config/security/dependency-check-suppression.xml` |
| 6 | Trivy filesystem/config | `ci/scripts/run-trivy-fs.sh`, `.trivyignore.yaml` |
| 7 | Six deterministic image builds | `ci/scripts/build-images.sh`, `backend-service/Dockerfile`, `frontend/Dockerfile` |
| 8 | Trivy image scans | `ci/scripts/scan-images.sh` |
| 9 | Syft SBOM generation | `ci/scripts/generate-sboms.sh` |
| 10 | Harbor publish/sign/attest/verify | `ci/scripts/publish-harbor.sh`, `ci/scripts/write-release-manifest.py` |

## Required Reports

```text
reports/phase-03-trufflehog/
reports/phase-04-sonarqube/
reports/phase-05-dependency-check/
reports/phase-06-trivy-fs/
reports/phase-07-build/
reports/phase-08-trivy-image/
reports/phase-09-sbom/
reports/phase-10-harbor/
```

Reports are Jenkins artifacts and are ignored by Git.

## Security Gate Thresholds

- TruffleHog verified findings: `0`
- SonarQube quality gate: `OK`
- Dependency-Check unsuppressed CVSS `>= 7.0`: `0`
- Trivy critical vulnerabilities: `0`
- Trivy fixable high vulnerabilities: `0`
- High/critical secrets and misconfigurations: `0`
- Unsigned Harbor digest: `0`
- Unverified SBOM attestation: `0`

## Local Phase Commands

Run quality gates:

```bash
bash ci/scripts/validate-repository.sh
cd backend-service
npm ci --legacy-peer-deps
npm run lint:check
npm run build:all
npm test
npm run test:cov:all
cd ../frontend
npm ci
npm run typecheck
npm run build
```

Run security/container phases on a prepared Jenkins-like EC2 host:

```bash
cd /home/ubuntu/vault_bank
export HARBOR_REGISTRY=harbor.example.com
export HARBOR_PROJECT=vaultbank
bash ci/scripts/jenkins-preflight.sh
bash ci/scripts/run-trufflehog.sh current
bash ci/scripts/run-trufflehog.sh history
bash ci/scripts/run-sonar.sh
bash ci/scripts/run-dependency-check.sh
bash ci/scripts/run-trivy-fs.sh
bash ci/scripts/build-images.sh
bash ci/scripts/scan-images.sh
bash ci/scripts/generate-sboms.sh
bash ci/scripts/publish-harbor.sh all
```

The manual security commands require the same tokens, Harbor credentials, and Cosign/AWS KMS access that Jenkins uses.

## Rollback Notes

- A failed secret gate requires immediate revoke/rotate before rerun.
- A failed dependency or Trivy gate requires dependency upgrade, base image update, or an approved expiring exception.
- A failed Harbor push/sign/attest gate means the digest is not releasable.
- Never promote by mutable tags. Use only digests from `reports/phase-10-harbor/release-manifest.json`.
