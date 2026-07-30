#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${ROOT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
SERVICE_MAP="${SERVICE_MAP:-${ROOT_DIR}/config/service-map.txt}"

[ -f "${SERVICE_MAP}" ] || {
  printf 'service map not found: %s\n' "${SERVICE_MAP}" >&2
  exit 1
}

service_map_rows() {
  awk -F'|' '
    $1 !~ /^($|#)/ {
      if (NF < 7) {
        printf "invalid service-map row %s: expected at least 7 pipe-delimited fields\n", NR > "/dev/stderr"
        exit 1
      }
      print
    }
  ' "${SERVICE_MAP}"
}

service_names() {
  service_map_rows | awk -F'|' '{print $1}'
}

backend_services() {
  service_map_rows | awk -F'|' '$2 == "backend" {print $1}'
}

frontend_services() {
  service_map_rows | awk -F'|' '$2 == "frontend" {print $1}'
}

service_row() {
  local service="$1"
  service_map_rows | awk -F'|' -v service="${service}" '$1 == service {print; found=1} END {exit found ? 0 : 1}'
}

service_field() {
  local service="$1"
  local field="$2"
  service_row "${service}" | awk -F'|' -v field="${field}" '{print $field}'
}

service_kind() {
  service_field "$1" 2
}

service_context() {
  service_field "$1" 3
}

service_dockerfile() {
  service_field "$1" 4
}

service_build_arg() {
  service_field "$1" 5
}

service_health_path() {
  service_field "$1" 6
}

service_metrics_path() {
  service_field "$1" 7
}
