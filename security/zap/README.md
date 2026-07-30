# OWASP ZAP DAST

Jenkins runs `ci/scripts/run-zap.sh` against `ZAP_TARGET_URL` after staging is
healthy.

Recommended POC values:

```bash
export ZAP_TARGET_URL=https://EC2_PUBLIC_DNS:30443
export ZAP_MODE=baseline
export ZAP_FAIL_ON_WARN=0
bash ci/scripts/run-zap.sh
```

Release gate:

- High-risk findings block release.
- Baseline scan runs on every merge.
- Full scan can run nightly with `ZAP_MODE=full`.
