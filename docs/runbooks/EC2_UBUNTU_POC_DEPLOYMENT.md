# EC2 Ubuntu POC Deployment Runbook

This runbook gets the current repo running on one Ubuntu EC2 instance for
learning. It is POC-safe, not production-grade banking infrastructure.

## 1. Prepare EC2

Use Ubuntu 22.04 or 24.04 on a small EC2 instance. A free-tier-sized instance is
tight; add swap before building images.

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

sudo bash ci/scripts/bootstrap-ec2-tools.sh
sudo reboot
```

After reconnecting:

```bash
docker version
kubectl get nodes
```

## 2. Fastest POC: Docker Compose

Use this path first to prove the website/API work before k3s/GitOps.

```bash
cd ~/bank-backend/backend-service
cp .env.example .env
# Fill .env with real local POC values. Do not commit this file.

docker compose --env-file .env up -d --build postgres redis rabbitmq vault vault-init
docker compose --env-file .env up -d --build auth-service account-service transaction-service payment-service notification-service nginx
docker compose ps
```

Verify backend gateway:

```bash
curl -k https://127.0.0.1/health/auth
curl -k https://127.0.0.1/metrics/auth
```

Run frontend locally on EC2, or build the frontend image:

```bash
cd ~/bank-backend/frontend
npm ci
VITE_API_BASE_URL=https://EC2_PUBLIC_DNS/api npm run build
```

## 3. k3s POC Deployment

Create the runtime secret from your EC2 `.env` values. This is acceptable only
for POC. Production should use Vault Kubernetes auth and short-lived database
credentials.

```bash
kubectl create namespace vaultbank-staging --dry-run=client -o yaml | kubectl apply -f -
kubectl -n vaultbank-staging create secret generic banking-runtime-secrets \
  --from-env-file=backend-service/.env \
  --dry-run=client -o yaml | kubectl apply -f -
```

Build images and either push to ECR or import local images into k3s.

ECR path:

```bash
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export IMAGE_TAG=$(git rev-parse --short=12 HEAD)

bash ci/scripts/build-images.sh
bash ci/scripts/scan-images.sh
bash ci/scripts/publish-images-ecr.sh
bash ci/scripts/update-gitops-images.sh staging
```

Local k3s path for learning:

```bash
export AWS_ACCOUNT_ID=000000000000
export IMAGE_TAG=local
bash ci/scripts/build-images.sh
bash ci/scripts/update-gitops-images.sh staging

for image in $(cat reports/devsecops/*/images.txt | tail -n 7); do
  docker save "$image" | sudo k3s ctr images import -
done
```

Render and apply:

```bash
kustomize build gitops/overlays/staging
kubectl apply -k gitops/overlays/staging
kubectl -n vaultbank-staging get pods
```

Verify:

```bash
curl -k https://127.0.0.1:30443/health/auth
curl -k https://127.0.0.1:30443/metrics/auth
curl http://127.0.0.1:30081/health
```

## 4. Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
# Edit repoURL in gitops/argocd/*.yaml first.
kubectl apply -f gitops/argocd/staging-application.yaml
kubectl apply -f gitops/argocd/prod-application.yaml
```

Staging auto-syncs. Production is manual-sync and must follow Jenkins approval.

## 5. Cost Safety

```bash
AWS_ACCOUNT_ID=123456789012 BUDGET_EMAIL=you@example.com bash ci/scripts/create-aws-budget-alerts.sh
```

Stop EC2 when not testing:

```bash
sudo shutdown -h now
```
