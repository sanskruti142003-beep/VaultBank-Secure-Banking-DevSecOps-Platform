output "ecr_repository_urls" {
  description = "ECR repositories used by Jenkins image publishing."
  value = {
    for name, repo in aws_ecr_repository.vaultbank : name => repo.repository_url
  }
}

output "budget_names" {
  description = "AWS Budgets created for POC cost safety."
  value       = [for budget in aws_budgets_budget.monthly_poc : budget.name]
}
