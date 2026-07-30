#!/bin/sh
set -eu

: "${VAULT_DEV_ROOT_TOKEN_ID:?VAULT_DEV_ROOT_TOKEN_ID is required}"
: "${AUTH_SERVICE_DB_PASSWORD:?AUTH_SERVICE_DB_PASSWORD is required}"
: "${ACCOUNT_SERVICE_DB_PASSWORD:?ACCOUNT_SERVICE_DB_PASSWORD is required}"
: "${TRANSACTION_SERVICE_DB_PASSWORD:?TRANSACTION_SERVICE_DB_PASSWORD is required}"
: "${PAYMENT_SERVICE_DB_PASSWORD:?PAYMENT_SERVICE_DB_PASSWORD is required}"
: "${AUDIT_SERVICE_DB_PASSWORD:?AUDIT_SERVICE_DB_PASSWORD is required}"
: "${REDIS_PASSWORD:?REDIS_PASSWORD is required}"
: "${AUTH_SVC_RABBITMQ_PASSWORD:?AUTH_SVC_RABBITMQ_PASSWORD is required}"
: "${ACCOUNT_SVC_RABBITMQ_PASSWORD:?ACCOUNT_SVC_RABBITMQ_PASSWORD is required}"
: "${TRANSACTION_SVC_RABBITMQ_PASSWORD:?TRANSACTION_SVC_RABBITMQ_PASSWORD is required}"
: "${PAYMENT_SVC_RABBITMQ_PASSWORD:?PAYMENT_SVC_RABBITMQ_PASSWORD is required}"
: "${AUDIT_SVC_RABBITMQ_PASSWORD:?AUDIT_SVC_RABBITMQ_PASSWORD is required}"
: "${NOTIFICATION_SVC_RABBITMQ_PASSWORD:?NOTIFICATION_SVC_RABBITMQ_PASSWORD is required}"
: "${DEAD_LETTER_SVC_RABBITMQ_PASSWORD:?DEAD_LETTER_SVC_RABBITMQ_PASSWORD is required}"
: "${JWT_SECRET:?JWT_SECRET is required}"
: "${JWT_REFRESH_SECRET:?JWT_REFRESH_SECRET is required}"
: "${STRIPE_SECRET_KEY:?STRIPE_SECRET_KEY is required}"
: "${STRIPE_WEBHOOK_SECRET:?STRIPE_WEBHOOK_SECRET is required}"
: "${PAYPAL_CLIENT_ID:?PAYPAL_CLIENT_ID is required}"
: "${PAYPAL_CLIENT_SECRET:?PAYPAL_CLIENT_SECRET is required}"
: "${PAYPAL_WEBHOOK_ID:?PAYPAL_WEBHOOK_ID is required}"
: "${SMTP_HOST:=smtp.gmail.com}"
: "${SMTP_PORT:=465}"
: "${SMTP_SECURE:=true}"
: "${SMTP_USER:=noreply@example.test}"
: "${SMTP_FROM:=$SMTP_USER}"
: "${SMTP_PASS:?Set SMTP_PASS to your Google app password}"
: "${TWILIO_ACCOUNT_SID:=}"
: "${TWILIO_AUTH_TOKEN:=}"
: "${TWILIO_API_KEY:=}"
: "${TWILIO_API_KEY_SID:=}"
: "${TWILIO_API_SECRET:=}"
: "${TWILIO_FROM_PHONE_NUMBER:=${TWILIO_PHONE_NUMBER:-}}"
: "${TWILIO_MESSAGING_SERVICE_SID:=}"
: "${TWILIO_VERIFY_SERVICE_SID:=}"

twilio_api_key_value="${TWILIO_API_KEY_SID:-${TWILIO_API_KEY:-}}"
if [ -n "$TWILIO_ACCOUNT_SID" ]; then
  if [ -z "$TWILIO_AUTH_TOKEN" ] && { [ -z "$twilio_api_key_value" ] || [ -z "$TWILIO_API_SECRET" ]; }; then
    echo "Set TWILIO_AUTH_TOKEN, or set TWILIO_API_KEY_SID/TWILIO_API_KEY and TWILIO_API_SECRET" >&2
    exit 1
  fi
  if [ -z "$TWILIO_VERIFY_SERVICE_SID" ] && [ -z "$TWILIO_FROM_PHONE_NUMBER" ] && [ -z "$TWILIO_MESSAGING_SERVICE_SID" ]; then
    echo "Set TWILIO_VERIFY_SERVICE_SID, TWILIO_FROM_PHONE_NUMBER, or TWILIO_MESSAGING_SERVICE_SID" >&2
    exit 1
  fi
else
  echo "Twilio SMS is not configured. Payment OTP SMS will fail until TWILIO_ACCOUNT_SID and sender credentials are set." >&2
fi

export VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
export VAULT_TOKEN="$VAULT_DEV_ROOT_TOKEN_ID"
postgres_host="${POSTGRES_HOST:-${INFRASTRUCTURE_HOST:-localhost}}"
redis_host="${REDIS_HOST:-${INFRASTRUCTURE_HOST:-localhost}}"
rabbitmq_host="${RABBITMQ_HOST:-${INFRASTRUCTURE_HOST:-localhost}}"
postgres_port="${POSTGRES_PORT:-5432}"
redis_port="${REDIS_PORT:-6379}"
rabbitmq_port="${RABBITMQ_AMQP_PORT:-5672}"
rabbitmq_vhost="${RABBITMQ_VHOST_ENCODED:-%2Fbanking-dev}"

vault status >/dev/null

if ! vault secrets list -format=json | grep -q '"secret/"'; then
  vault secrets enable -path=secret -version=2 kv
fi

vault auth enable approle >/dev/null 2>&1 || true

read_optional_env() {
  variable_name="$1"
  eval "printf '%s' \"\${$variable_name:-}\""
}

vault kv put secret/banking/auth-service \
  DB_URL="postgresql://auth_service:${AUTH_SERVICE_DB_PASSWORD}@${postgres_host}:${postgres_port}/user_db" \
  JWT_SECRET="$JWT_SECRET" \
  JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
  REDIS_URL="redis://:${REDIS_PASSWORD}@${redis_host}:${redis_port}/0" \
  RABBITMQ_URL="amqp://auth_svc:${AUTH_SVC_RABBITMQ_PASSWORD}@${rabbitmq_host}:${rabbitmq_port}/${rabbitmq_vhost}" \
  SMTP_HOST="$SMTP_HOST" \
  SMTP_PORT="$SMTP_PORT" \
  SMTP_SECURE="$SMTP_SECURE" \
  SMTP_USER="$SMTP_USER" \
  SMTP_FROM="$SMTP_FROM" \
  SMTP_PASS="$SMTP_PASS"

vault kv put secret/banking/account-service \
  DB_URL="postgresql://account_service:${ACCOUNT_SERVICE_DB_PASSWORD}@${postgres_host}:${postgres_port}/account_db" \
  REDIS_URL="redis://:${REDIS_PASSWORD}@${redis_host}:${redis_port}/1" \
  RABBITMQ_URL="amqp://account_svc:${ACCOUNT_SVC_RABBITMQ_PASSWORD}@${rabbitmq_host}:${rabbitmq_port}/${rabbitmq_vhost}"

vault kv put secret/banking/transaction-service \
  DB_URL="postgresql://transaction_service:${TRANSACTION_SERVICE_DB_PASSWORD}@${postgres_host}:${postgres_port}/transaction_db" \
  REDIS_URL="redis://:${REDIS_PASSWORD}@${redis_host}:${redis_port}/1" \
  RABBITMQ_URL="amqp://transaction_svc:${TRANSACTION_SVC_RABBITMQ_PASSWORD}@${rabbitmq_host}:${rabbitmq_port}/${rabbitmq_vhost}"

vault kv put secret/banking/payment-service \
  DB_URL="postgresql://payment_service:${PAYMENT_SERVICE_DB_PASSWORD}@${postgres_host}:${postgres_port}/payment_db" \
  REDIS_URL="redis://:${REDIS_PASSWORD}@${redis_host}:${redis_port}/1" \
  RABBITMQ_URL="amqp://payment_svc:${PAYMENT_SVC_RABBITMQ_PASSWORD}@${rabbitmq_host}:${rabbitmq_port}/${rabbitmq_vhost}" \
  STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
  PAYPAL_CLIENT_ID="$PAYPAL_CLIENT_ID" \
  PAYPAL_CLIENT_SECRET="$PAYPAL_CLIENT_SECRET" \
  PAYPAL_WEBHOOK_ID="$PAYPAL_WEBHOOK_ID" \
  SMTP_HOST="$SMTP_HOST" \
  SMTP_PORT="$SMTP_PORT" \
  SMTP_SECURE="$SMTP_SECURE" \
  SMTP_USER="$SMTP_USER" \
  SMTP_FROM="$SMTP_FROM" \
  SMTP_PASS="$SMTP_PASS" \
  PAYMENT_OTP_CHANNEL="${PAYMENT_OTP_CHANNEL:-sms}" \
  PAYMENT_OTP_EMAIL_FALLBACK="${PAYMENT_OTP_EMAIL_FALLBACK:-true}" \
  TWILIO_ACCOUNT_SID="$TWILIO_ACCOUNT_SID" \
  TWILIO_AUTH_TOKEN="$TWILIO_AUTH_TOKEN" \
  TWILIO_API_KEY="$TWILIO_API_KEY" \
  TWILIO_API_KEY_SID="$TWILIO_API_KEY_SID" \
  TWILIO_API_SECRET="$TWILIO_API_SECRET" \
  TWILIO_FROM_PHONE_NUMBER="$TWILIO_FROM_PHONE_NUMBER" \
  TWILIO_MESSAGING_SERVICE_SID="$TWILIO_MESSAGING_SERVICE_SID" \
  TWILIO_VERIFY_SERVICE_SID="$TWILIO_VERIFY_SERVICE_SID"

vault kv put secret/banking/audit-service \
  DB_URL="postgresql://audit_service:${AUDIT_SERVICE_DB_PASSWORD}@${postgres_host}:${postgres_port}/audit_db" \
  REDIS_URL="redis://:${REDIS_PASSWORD}@${redis_host}:${redis_port}/1" \
  RABBITMQ_URL="amqp://audit_svc:${AUDIT_SVC_RABBITMQ_PASSWORD}@${rabbitmq_host}:${rabbitmq_port}/${rabbitmq_vhost}"

vault kv put secret/banking/notification-service \
  REDIS_URL="redis://:${REDIS_PASSWORD}@${redis_host}:${redis_port}/1" \
  RABBITMQ_URL="amqp://notification_svc:${NOTIFICATION_SVC_RABBITMQ_PASSWORD}@${rabbitmq_host}:${rabbitmq_port}/${rabbitmq_vhost}" \
  SMTP_HOST="$SMTP_HOST" \
  SMTP_PORT="$SMTP_PORT" \
  SMTP_SECURE="$SMTP_SECURE" \
  SMTP_USER="$SMTP_USER" \
  SMTP_FROM="$SMTP_FROM" \
  SMTP_PASS="$SMTP_PASS" \
  TWILIO_ACCOUNT_SID="$TWILIO_ACCOUNT_SID" \
  TWILIO_AUTH_TOKEN="$TWILIO_AUTH_TOKEN" \
  TWILIO_API_KEY="$TWILIO_API_KEY" \
  TWILIO_API_KEY_SID="$TWILIO_API_KEY_SID" \
  TWILIO_API_SECRET="$TWILIO_API_SECRET" \
  TWILIO_FROM_PHONE_NUMBER="$TWILIO_FROM_PHONE_NUMBER" \
  TWILIO_MESSAGING_SERVICE_SID="$TWILIO_MESSAGING_SERVICE_SID" \
  TWILIO_VERIFY_SERVICE_SID="$TWILIO_VERIFY_SERVICE_SID"

vault kv put secret/banking/dead-letter-service \
  RABBITMQ_URL="amqp://dead_letter_svc:${DEAD_LETTER_SVC_RABBITMQ_PASSWORD}@${rabbitmq_host}:${rabbitmq_port}/${rabbitmq_vhost}"

credentials_file=/vault/init-output/approle-credentials.env
: > "$credentials_file"
chmod 600 "$credentials_file"

create_approle() {
  service_name="$1"
  policy_name="$2"
  env_prefix="$3"
  configured_role_id="$(read_optional_env "${env_prefix}_VAULT_ROLE_ID")"
  configured_secret_id="$(read_optional_env "${env_prefix}_VAULT_SECRET_ID")"

  vault policy write "$policy_name" "/vault/policies/${policy_name}.hcl"
  vault write "auth/approle/role/${service_name}" \
    token_policies="$policy_name" \
    token_ttl="1h" \
    token_max_ttl="24h" \
    secret_id_ttl="${APPROLE_SECRET_ID_TTL:-0}" \
    secret_id_num_uses="${APPROLE_SECRET_ID_NUM_USES:-0}"

  if [ -n "$configured_role_id" ]; then
    vault write "auth/approle/role/${service_name}/role-id" \
      role_id="$configured_role_id" >/dev/null
  fi

  role_id="$(vault read -field=role_id "auth/approle/role/${service_name}/role-id")"

  if [ -n "$configured_secret_id" ]; then
    secret_id_error_file="/tmp/${service_name}-secret-id-error"
    if ! vault write "auth/approle/role/${service_name}/custom-secret-id" \
      secret_id="$configured_secret_id" >/dev/null 2>"$secret_id_error_file"; then
      if ! grep -q "SecretID is already registered" "$secret_id_error_file"; then
        cat "$secret_id_error_file" >&2
        exit 1
      fi
    fi
    rm -f "$secret_id_error_file"
    secret_id="$configured_secret_id"
  else
    secret_id="$(vault write -field=secret_id -f "auth/approle/role/${service_name}/secret-id")"
  fi

  {
    printf '%s_VAULT_ROLE_ID=%s\n' "$env_prefix" "$role_id"
    printf '%s_VAULT_SECRET_ID=%s\n' "$env_prefix" "$secret_id"
  } >> "$credentials_file"
}

create_approle auth-service auth-service AUTH_SERVICE
create_approle account-service account-service ACCOUNT_SERVICE
create_approle transaction-service transaction-service TRANSACTION_SERVICE
create_approle payment-service payment-service PAYMENT_SERVICE
create_approle audit-service audit-service AUDIT_SERVICE
create_approle notification-service notification-service NOTIFICATION_SERVICE
create_approle dead-letter-service dead-letter-service DEAD_LETTER_SERVICE

cat "$credentials_file"
echo "AppRole credentials were also written to $credentials_file."
