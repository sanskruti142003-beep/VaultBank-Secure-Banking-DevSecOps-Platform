#!/bin/sh
set -eu

hash_password() {
  rabbitmqctl hash_password "$1" | tail -n 1
}

escape_sed() {
  printf '%s' "$1" | sed 's/[\/&]/\\&/g'
}

replace_hash() {
  placeholder="$1"
  password="$2"
  hash="$(hash_password "$password")"
  escaped_hash="$(escape_sed "$hash")"
  sed -i "s/$placeholder/$escaped_hash/g" /etc/rabbitmq/definitions.json
}

cp /etc/rabbitmq/definitions.template.json /etc/rabbitmq/definitions.json

replace_hash "__RABBITMQ_ADMIN_PASSWORD_HASH__" "$RABBITMQ_ADMIN_PASSWORD"
replace_hash "__AUTH_SVC_PASSWORD_HASH__" "$AUTH_SVC_RABBITMQ_PASSWORD"
replace_hash "__ACCOUNT_SVC_PASSWORD_HASH__" "$ACCOUNT_SVC_RABBITMQ_PASSWORD"
replace_hash "__TRANSACTION_SVC_PASSWORD_HASH__" "$TRANSACTION_SVC_RABBITMQ_PASSWORD"
replace_hash "__PAYMENT_SVC_PASSWORD_HASH__" "$PAYMENT_SVC_RABBITMQ_PASSWORD"
replace_hash "__AUDIT_SVC_PASSWORD_HASH__" "$AUDIT_SVC_RABBITMQ_PASSWORD"
replace_hash "__NOTIFICATION_SVC_PASSWORD_HASH__" "$NOTIFICATION_SVC_RABBITMQ_PASSWORD"
replace_hash "__DEAD_LETTER_SVC_PASSWORD_HASH__" "$DEAD_LETTER_SVC_RABBITMQ_PASSWORD"

exec /usr/local/bin/docker-entrypoint.sh rabbitmq-server
