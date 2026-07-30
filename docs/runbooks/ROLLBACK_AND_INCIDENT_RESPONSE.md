# Rollback and Incident Response

## Rollback

Staging and production are GitOps-controlled.

1. Identify the last known-good commit or image digest.
2. Revert the GitOps image update.
3. Let Argo CD sync staging first.
4. Run smoke tests.
5. Promote the same revert to prod after approval.

Commands:

```bash
git log -- gitops/overlays/prod/kustomization.yaml
git revert <bad-gitops-commit>
git push
kubectl -n argocd get application vaultbank-prod
```

Manual emergency rollback:

```bash
kubectl -n vaultbank-prod rollout undo deployment/auth-service
kubectl -n vaultbank-prod rollout status deployment/auth-service
```

Use manual rollback only when GitOps rollback is too slow for the incident.
Follow up by committing the reverted desired state.

## Security Incident

Secret finding:

1. Stop the pipeline.
2. Revoke or rotate the credential.
3. Purge Git history if the secret reached history.
4. Update `docs/SECURITY_REMEDIATION.md`.
5. Rerun TruffleHog current-tree and full-history scans.

Critical/high scanner finding:

1. Keep the release blocked.
2. Import the report into DefectDojo.
3. Assign owner and SLA.
4. Remediate and rerun the failing gate.

Runtime compromise suspicion:

1. Isolate the EC2 security group to known admin IPs.
2. Snapshot EBS/RDS for forensics.
3. Rotate Vault AppRole secret IDs, JWT secrets, database passwords, SMTP keys,
   payment provider keys, and AWS IAM access keys used by CI.
4. Rebuild images from a clean commit and redeploy.
5. Review NGINX, app, Vault, and Kubernetes audit logs.

## Recovery Objectives for POC

- RPO: latest RDS automated snapshot or manual snapshot.
- RTO: rebuild EC2/k3s from repo and restore database snapshot within a day.

Production-grade banking targets should be stricter and rehearsed quarterly.
