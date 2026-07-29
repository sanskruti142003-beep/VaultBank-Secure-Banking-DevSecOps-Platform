variable "aws_region" {
  description = "AWS region for S3. CloudFront remains a global service."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name prefix used for CloudFront resources."
  type        = string
  default     = "vaultbank"
}

variable "bucket_name" {
  description = "Globally unique private S3 bucket name for frontend assets."
  type        = string
}

variable "domain_names" {
  description = "Optional custom frontend domains for CloudFront aliases."
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for custom CloudFront domains."
  type        = string
  default     = ""
}

variable "cache_policy_id" {
  description = "CloudFront cache policy id. Default is AWS managed CachingOptimized."
  type        = string
  default     = "658327ea-f89d-4fab-a63d-7e88639e58f6"
}
