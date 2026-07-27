# Local reference configuration. Docker Compose starts Vault with `server -dev`,
# so this file documents the equivalent local listener shape.
ui = true
disable_mlock = true

storage "inmem" {}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

api_addr = "http://127.0.0.1:8200"
