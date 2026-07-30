# AWS Free Tier POC Foundation

This Terraform folder creates the low-cost foundation used by the Jenkins and
k3s flow:

- AWS Budgets alerts at 1, 10, and 40 USD.
- ECR repositories for the five backend services, gateway, and frontend.
- Optional RDS PostgreSQL and ElastiCache Redis placeholders are intentionally
  disabled by default to avoid surprise spend.

POC-safe defaults are not production-grade banking defaults. For production,
use private subnets, Multi-AZ RDS, customer-managed KMS keys, centralized
CloudTrail, AWS Backup, and a managed Kubernetes control plane when budget
allows.

```bash
terraform -chdir=infra/aws-free-tier init
terraform -chdir=infra/aws-free-tier plan \
  -var='aws_account_id=123456789012' \
  -var='budget_email=you@example.com'
terraform -chdir=infra/aws-free-tier apply \
  -var='aws_account_id=123456789012' \
  -var='budget_email=you@example.com'
```
