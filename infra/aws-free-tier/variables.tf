variable "aws_region" {
  description = "AWS region for ECR and optional POC resources."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID used by AWS Budgets."
  type        = string
}

variable "budget_email" {
  description = "Email address that receives budget alerts."
  type        = string
}

variable "repository_prefix" {
  description = "ECR repository prefix."
  type        = string
  default     = "vaultbank"
}

variable "enable_poc_rds" {
  description = "Opt-in flag for a Free Tier-sized RDS PostgreSQL instance. Disabled by default to avoid spend."
  type        = bool
  default     = false
}

variable "enable_poc_elasticache" {
  description = "Opt-in flag for a Free Tier-sized ElastiCache Redis node where available. Disabled by default to avoid spend."
  type        = bool
  default     = false
}
