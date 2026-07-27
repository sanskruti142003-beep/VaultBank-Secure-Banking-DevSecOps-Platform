# Production example only. Vault dev mode must never be used outside local work.
ui = true
disable_mlock = false

api_addr     = "https://vault.internal:8200"
cluster_addr = "https://vault.internal:8201"

storage "file" {
  path = "/vault/data"
}

seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "alias/banking-vault-auto-unseal"
}

listener "tcp" {
  address            = "0.0.0.0:8200"
  cluster_address    = "0.0.0.0:8201"
  tls_disable        = false
  tls_cert_file      = "/vault/tls/tls.crt"
  tls_key_file       = "/vault/tls/tls.key"
  tls_client_ca_file = "/vault/tls/ca.crt"
}

telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}
