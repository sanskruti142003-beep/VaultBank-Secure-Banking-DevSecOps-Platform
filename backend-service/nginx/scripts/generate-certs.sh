#!/bin/sh
set -eu

output_dir="${1:-/certs}"
common_name="${NGINX_HOST:-localhost}"

mkdir -p "$output_dir"
umask 077

openssl req \
  -x509 \
  -nodes \
  -newkey rsa:2048 \
  -sha256 \
  -days 825 \
  -keyout "$output_dir/self-signed.key" \
  -out "$output_dir/self-signed.crt" \
  -subj "/C=US/ST=Local/L=Local/O=Banking Development/OU=API Gateway/CN=$common_name" \
  -addext "subjectAltName=DNS:$common_name,DNS:localhost,DNS:banking.local,IP:127.0.0.1"

chmod 600 "$output_dir/self-signed.key"
chmod 644 "$output_dir/self-signed.crt"

echo "Generated local TLS certificate for $common_name in $output_dir"
