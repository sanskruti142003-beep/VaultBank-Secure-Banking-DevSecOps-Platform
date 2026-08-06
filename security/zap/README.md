# OWASP ZAP DAST

Jenkins runs `ci/scripts/run-zap.sh` against `ZAP_TARGET_URL` after staging is
healthy.

Before authenticated ZAP, apply the contract in
`security/zap/authenticated-session-contract.md`. The staging identity must be a
non-admin synthetic customer, created by the GitOps seed job from protected
Vault/Jenkins/Kubernetes secret values.

Recommended POC values:

```bash
export ZAP_TARGET_URL=https://EC2_PUBLIC_DNS:30443
export ZAP_MODE=baseline
export ZAP_FAIL_ON_WARN=0
bash ci/scripts/phase5f-a1a-zap-auth-discovery.sh
bash ci/scripts/run-zap.sh
```

Release gate:

- High-risk findings block release.
- Baseline scan runs on every merge.
- Full scan can run nightly with `ZAP_MODE=full`.
- `405`, `429`, and `500` during authentication discovery are not successful
  route validation results.
