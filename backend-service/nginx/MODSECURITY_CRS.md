# NGINX ModSecurity + OWASP CRS POC

AWS WAF is intentionally not enabled for the Free Tier POC because it can add
cost. The free substitute is the optional ModSecurity CRS gateway image.

Build it through the normal image script:

```bash
USE_MODSECURITY_GATEWAY=1 AWS_ACCOUNT_ID=123456789012 bash ci/scripts/build-images.sh
```

POC notes:

- CRS is heavier than plain NGINX. On a tiny EC2 instance, use it for staging
  security testing and stop the stack when done.
- Start with paranoia level 1. Raise only after false positives are reviewed.
- Paid production option: AWS WAF managed rules in front of CloudFront/API edge.
