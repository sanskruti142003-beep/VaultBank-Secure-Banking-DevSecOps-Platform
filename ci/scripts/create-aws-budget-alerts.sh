#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

require_command aws

BUDGET_EMAIL="${BUDGET_EMAIL:-}"
BUDGET_NAME_PREFIX="${BUDGET_NAME_PREFIX:-vaultbank-poc}"

[ -n "${AWS_ACCOUNT_ID}" ] || die "AWS_ACCOUNT_ID is required"
[ -n "${BUDGET_EMAIL}" ] || die "BUDGET_EMAIL is required"

for amount in 1 10 40; do
  budget_name="${BUDGET_NAME_PREFIX}-${amount}-usd"
  budget_file="${REPORT_DIR}/budget-${amount}.json"
  notifications_file="${REPORT_DIR}/budget-${amount}-notifications.json"

  cat > "${budget_file}" <<EOF
{
  "BudgetName": "${budget_name}",
  "BudgetLimit": {
    "Amount": "${amount}",
    "Unit": "USD"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
EOF

  cat > "${notifications_file}" <<EOF
[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [
      {
        "SubscriptionType": "EMAIL",
        "Address": "${BUDGET_EMAIL}"
      }
    ]
  }
]
EOF

  aws budgets describe-budget --account-id "${AWS_ACCOUNT_ID}" --budget-name "${budget_name}" \
    > "${REPORT_DIR}/${budget_name}-existing.json" 2>/dev/null ||
    aws budgets create-budget \
      --account-id "${AWS_ACCOUNT_ID}" \
      --budget "file://${budget_file}" \
      --notifications-with-subscribers "file://${notifications_file}" \
      > "${REPORT_DIR}/${budget_name}-created.json"
done

log "PASS: AWS Budget alerts at 1, 10, and 40 USD"
