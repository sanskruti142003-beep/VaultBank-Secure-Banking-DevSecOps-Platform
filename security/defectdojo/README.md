# DefectDojo Import

Jenkins imports SAST/SCA/container/DAST reports with
`ci/scripts/import-defectdojo.sh`.

Required Jenkins credential:

- `defectdojo-token`: DefectDojo API token.

Required environment:

```bash
export DEFECTDOJO_URL=https://defectdojo.example.com
export DEFECTDOJO_PRODUCT_NAME=VaultBank
```

Release gate:

- No open critical/high findings for production promotion.
- Critical SLA: 48 hours.
- High SLA: 7 days.
- Medium SLA: 30 days.
