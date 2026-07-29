# Frontend S3 and CloudFront Deployment

This Terraform stack publishes the Vite frontend from a private S3 bucket
through CloudFront.

## Deploy infrastructure

```bash
terraform init
terraform plan -var="bucket_name=vaultbank-frontend-prod"
terraform apply -var="bucket_name=vaultbank-frontend-prod"
```

For a custom domain, create or import an ACM certificate in `us-east-1`, then
pass both values:

```bash
terraform apply \
  -var="bucket_name=vaultbank-frontend-prod" \
  -var='domain_names=["app.example.com"]' \
  -var="acm_certificate_arn=arn:aws:acm:us-east-1:123456789012:certificate/example"
```

## Publish frontend build

```bash
cd ../../frontend
npm ci
npm run build
aws s3 sync dist "s3://$(terraform -chdir=../infra/frontend-s3-cloudfront output -raw bucket_name)" --delete
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir=../infra/frontend-s3-cloudfront output -raw cloudfront_distribution_id)" \
  --paths "/*"
```
