# Argo CD Applications

Replace `repoURL` in the application manifests with your repository URL before
applying them.

Staging is automated with prune and self-heal. Production is manual-sync by
default so Jenkins and the release owner can enforce an approval gate.

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -f gitops/argocd/staging-application.yaml
kubectl apply -f gitops/argocd/prod-application.yaml
```

POC note: Running Argo CD, Vault, RabbitMQ, monitoring, and all services on one
free-tier EC2 instance is memory-constrained. Keep replicas at 1 and stop the
cluster when not learning/testing.
