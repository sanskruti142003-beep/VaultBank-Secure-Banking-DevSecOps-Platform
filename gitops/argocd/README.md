# Argo CD Applications

Replace `repoURL` in the application manifests with your repository URL before
applying them.

Staging is automated with prune and self-heal. Production is manual-sync by
default so Jenkins and the release owner can enforce an approval gate.

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -k gitops/argocd
kubectl apply -f gitops/argocd/prod-application.yaml
```

Apply the staging bootstrap whenever the EC2 instance is rebuilt or restarted
after a long stop. The bootstrap reapplies the Argo CD AppProjects before the
Applications, which keeps PreSync resources such as database migration Jobs
permitted by the restricted `vault-bank-staging` project.

```bash
bash ci/scripts/reconcile-argocd-staging.sh
```

POC note: Running Argo CD, Vault, RabbitMQ, monitoring, and all services on one
free-tier EC2 instance is memory-constrained. Keep replicas at 1 and stop the
cluster when not learning/testing.
