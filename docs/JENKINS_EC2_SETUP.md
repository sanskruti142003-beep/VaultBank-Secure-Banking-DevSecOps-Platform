# Jenkins EC2 Setup For Vault Bank Phases 1-10

This setup is for an AWS Free Tier/POC EC2 Jenkins controller or agent. It is not production-grade isolation.

## Required Jenkins Plugins

- Pipeline
- Git
- GitHub Branch Source
- Credentials Binding
- Docker Pipeline
- SonarQube Scanner for Jenkins
- JUnit
- HTML Publisher
- Pipeline Utility Steps
- Workspace Cleanup
- Timestamper
- Build Timeout

## Required Credentials

Create these exact Jenkins credential IDs:

| Credential ID | Type | Use |
| --- | --- | --- |
| `sonarcloud-token` | Secret text | `Jenkinsfile.ci` SonarCloud analysis and project quality-gate sync |
| `sonarqube-token` | Secret text | Legacy `Jenkinsfile` SonarCloud/SonarQube analysis and project quality-gate sync |
| `nvd-api-key` | Secret text | OWASP Dependency-Check NVD updates |
| `harbor-robot` | Username/password | Harbor robot account |
| `harbor-ca-cert` | Secret file | Harbor CA certificate, or a harmless trusted CA file if Harbor uses public TLS |

Cosign is configured for AWS KMS by default:

For the Free Tier POC SonarCloud gate, the Sonar token must be able to administer
the project quality gate. Jenkins syncs `Vault Bank POC Quality Gate` from
`config/pipeline-policy.yml` before running analysis, including the 50 percent
new-code coverage threshold.

```text
awskms:///alias/vaultbank-cosign
```

Attach an EC2 IAM role that can use that KMS key. Do not store AWS access keys in Jenkins.

## EC2 Tooling

Install these on the Jenkins node:

```bash
node --version    # must be v22.x
npm --version
docker --version
trivy --version
syft version
cosign version
python3 --version
```

TruffleHog, Sonar Scanner, and Dependency-Check may run from local binaries or Docker images. Trivy, Syft, and Cosign must be installed locally for the image, SBOM, and signing stages.

Create the persistent Dependency-Check data directory:

```bash
sudo mkdir -p /var/lib/jenkins/dependency-check-data
sudo chown -R jenkins:jenkins /var/lib/jenkins/dependency-check-data
```

Allow Jenkins to use Docker through the controlled Jenkins user:

```bash
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins
```

## Jenkins Job

Create a Multibranch Pipeline for:

```text
https://github.com/sonappatil/vault_bank.git
```

Use `Jenkinsfile` from the repository. Configure GitHub webhooks so PRs and branches trigger builds.

Set the build parameter:

```text
HARBOR_REGISTRY=<your-harbor-host>
```

Example:

```text
HARBOR_REGISTRY=harbor.example.com
```

## First Manual Validation On EC2

From a normal clone, not the Jenkins workspace:

```bash
cd /home/ubuntu/vault_bank
git pull origin main
bash ci/scripts/validate-repository.sh
bash ci/scripts/jenkins-preflight.sh
```

The Jenkins pipeline itself must still run from its own workspace and checkout.

## Common NO-GO Causes

- Missing Jenkins credential IDs.
- Jenkins cannot access Docker.
- Node.js is not version 22.
- `HARBOR_REGISTRY` parameter is empty.
- SonarQube installation in Jenkins is not named `SonarQube`.
- AWS KMS alias `alias/vaultbank-cosign` does not exist or EC2 IAM role cannot use it.
- Harbor project `vaultbank` does not exist or robot account cannot push.
