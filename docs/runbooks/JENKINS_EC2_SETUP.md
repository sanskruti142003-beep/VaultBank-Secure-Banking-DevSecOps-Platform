# Jenkins EC2 Setup

Jenkins can run on the same EC2 host for the POC, but this is not
production-grade. Keep it stopped when not testing to control cost.

## Required Jenkins Credentials

| ID | Type | Purpose |
| --- | --- | --- |
| `aws-account-id` | Secret text | Builds ECR registry URLs |
| `sonar-token` | Secret text | SonarCloud/SonarQube scan |
| `nvd-api-key` | Secret text | Dependency-Check CVE feed stability |
| `cosign-key` | Secret file | Image signing key for POC |
| `defectdojo-token` | Secret text | Import scanner reports |

The AWS CLI should use the EC2 instance profile where possible. If you must use
access keys for a POC, store them only in Jenkins credentials and rotate them.

## Required Tools on Agent

```bash
sudo bash ci/scripts/bootstrap-ec2-tools.sh
docker version
aws --version
kubectl version --client
kustomize version
```

Install optional scanners as binaries for faster builds, or let the scripts use
Docker images:

- TruffleHog
- Sonar scanner
- OWASP Dependency-Check
- Trivy
- Syft
- Cosign

## Jenkins Job

1. Create a Pipeline job.
2. Set SCM to this GitHub repo.
3. Use `Jenkinsfile`.
4. Configure GitHub webhook to trigger PR and merge builds.
5. Make GitHub branch protection require the Jenkins status check.

## Verification

```bash
bash ci/scripts/validate-repository.sh
REPORT_ROOT=/tmp/devsecops bash ci/scripts/run-trufflehog.sh
```

The Jenkins job must fail on any security gate failure. Do not mark unstable
builds as deployable.
