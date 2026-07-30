provider "aws" {
  region = var.aws_region
}

locals {
  service_repositories = toset([
    "auth-service",
    "account-service",
    "transaction-service",
    "payment-service",
    "notification-service",
    "nginx-gateway",
    "frontend",
  ])
  budget_amounts = toset(["1", "10", "40"])
}

resource "aws_ecr_repository" "vaultbank" {
  for_each = local.service_repositories

  name                 = "${var.repository_prefix}/${each.key}"
  image_tag_mutability = "IMMUTABLE"

  encryption_configuration {
    encryption_type = "AES256"
  }

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "vaultbank" {
  for_each   = aws_ecr_repository.vaultbank
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the last 10 POC images to control storage cost"
        selection = {
          tagStatus     = "any"
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_budgets_budget" "monthly_poc" {
  for_each = local.budget_amounts

  name         = "${var.repository_prefix}-poc-${each.key}-usd"
  budget_type  = "COST"
  limit_amount = each.key
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_email]
  }
}

# POC-safe guardrails: the data resources below are intentionally not created by
# default. Add networking and password variables before enabling them.
resource "null_resource" "rds_guardrail" {
  count = var.enable_poc_rds ? 1 : 0

  lifecycle {
    precondition {
      condition     = false
      error_message = "RDS creation is intentionally disabled in this POC module. Add a reviewed VPC/subnet/password design before enabling."
    }
  }
}

resource "null_resource" "elasticache_guardrail" {
  count = var.enable_poc_elasticache ? 1 : 0

  lifecycle {
    precondition {
      condition     = false
      error_message = "ElastiCache creation is intentionally disabled in this POC module. Use self-hosted Redis for the POC unless you have confirmed Free Tier eligibility."
    }
  }
}
