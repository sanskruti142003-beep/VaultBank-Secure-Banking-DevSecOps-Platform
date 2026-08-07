#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
STAGING_APP="${STAGING_APP:-vault-bank-staging}"
RUNTIME_APP="${RUNTIME_APP:-vault-bank-runtime-staging}"
WAIT_TIMEOUT_SECONDS="${ARGOCD_WAIT_TIMEOUT_SECONDS:-300}"
POLL_SECONDS="${ARGOCD_POLL_SECONDS:-10}"

require_command kubectl
require_command grep
require_command sed
require_command tail

case "${WAIT_TIMEOUT_SECONDS}" in
  "" | *[!0-9]*)
    die "ARGOCD_WAIT_TIMEOUT_SECONDS must be a positive integer"
    ;;
esac

case "${POLL_SECONDS}" in
  "" | *[!0-9]*)
    die "ARGOCD_POLL_SECONDS must be a positive integer"
    ;;
esac

[ "${WAIT_TIMEOUT_SECONDS}" -gt 0 ] ||
  die "ARGOCD_WAIT_TIMEOUT_SECONDS must be greater than zero"

[ "${POLL_SECONDS}" -gt 0 ] ||
  die "ARGOCD_POLL_SECONDS must be greater than zero"

log "Applying Argo CD staging projects and applications"
kubectl apply -k "${ROOT_DIR}/gitops/argocd"

log "Verifying Argo CD project permits staging PreSync Jobs"
kubectl get appproject vault-bank-staging \
  --namespace "${ARGOCD_NAMESPACE}" \
  -o jsonpath='{range .spec.namespaceResourceWhitelist[*]}{.group}/{.kind}{"\n"}{end}' |
grep -qx 'batch/Job' ||
  die "AppProject vault-bank-staging does not permit batch/Job"

log "Requesting hard refresh for ${RUNTIME_APP} and ${STAGING_APP}"
refresh_stamp="$(date -u +%Y%m%dT%H%M%SZ)"

for app in "${RUNTIME_APP}" "${STAGING_APP}"; do
  kubectl patch application "${app}" \
    --namespace "${ARGOCD_NAMESPACE}" \
    --type merge \
    --patch "{\"metadata\":{\"annotations\":{\"argocd.argoproj.io/refresh\":\"hard\",\"vault-bank.io/reconciled-at\":\"${refresh_stamp}\"}}}" \
    >/dev/null
done

request_kubectl_sync() {
  local app="$1"
  local patch

  patch="$(
    cat <<JSON
{
  "operation": {
    "initiatedBy": {
      "username": "ec2-reconcile-script"
    },
    "sync": {
      "revision": "main",
      "prune": true,
      "syncOptions": [
        "CreateNamespace=false",
        "PruneLast=true"
      ],
      "syncStrategy": {
        "hook": {}
      }
    }
  }
}
JSON
  )"

  if kubectl patch application "${app}" \
    --namespace "${ARGOCD_NAMESPACE}" \
    --type merge \
    --patch "${patch}" \
    >/dev/null; then

    log "Requested Argo CD sync for ${app} through Kubernetes"
  else
    log "WARN: unable to request Argo CD sync for ${app}; it may already have an operation in progress"
  fi
}

clear_stale_operation() {
  local app="$1"
  local phase

  phase="$(
    kubectl get application "${app}" \
      --namespace "${ARGOCD_NAMESPACE}" \
      -o jsonpath='{.status.operationState.phase}' 2>/dev/null ||
      true
  )"

  case "${phase}" in
    Error | Failed)
      log "Clearing stale ${phase} Argo CD operation for ${app}"
      kubectl patch application "${app}" \
        --namespace "${ARGOCD_NAMESPACE}" \
        --type json \
        --patch '[{"op":"remove","path":"/operation"}]' \
        >/dev/null 2>&1 ||
        true
      ;;
  esac
}

print_app_diagnostics() {
  local app="$1"

  log "Current Argo CD status for ${app}"
  kubectl get application "${app}" \
    --namespace "${ARGOCD_NAMESPACE}" \
    -o jsonpath='sync={.status.sync.status} health={.status.health.status} revision={.status.sync.revision} operation={.status.operationState.phase}{"\n"}' ||
    true

  log "Recent Argo CD operation message for ${app}"
  kubectl get application "${app}" \
    --namespace "${ARGOCD_NAMESPACE}" \
    -o jsonpath='{.status.operationState.message}{"\n"}' ||
    true

  log "OutOfSync resources for ${app}"
  kubectl get application "${app}" \
    --namespace "${ARGOCD_NAMESPACE}" \
    -o jsonpath='{range .status.resources[?(@.status=="OutOfSync")]}{.group}{"/"}{.kind}{" "}{.namespace}{"/"}{.name}{"\n"}{end}' ||
    true

  log "Last sync resource results for ${app}"
  kubectl get application "${app}" \
    --namespace "${ARGOCD_NAMESPACE}" \
    -o jsonpath='{range .status.operationState.syncResult.resources[*]}{.syncPhase}{" "}{.kind}{" "}{.namespace}{"/"}{.name}{" "}{.status}{" "}{.message}{"\n"}{end}' |
    sed '/^$/d' ||
    true
}

if command -v argocd >/dev/null 2>&1 &&
  argocd app get "${STAGING_APP}" >/dev/null 2>&1; then
  log "Syncing ${RUNTIME_APP} with Argo CD CLI"
  argocd app sync "${RUNTIME_APP}" --timeout "${WAIT_TIMEOUT_SECONDS}"

  log "Syncing ${STAGING_APP} with Argo CD CLI"
  argocd app sync "${STAGING_APP}" --timeout "${WAIT_TIMEOUT_SECONDS}"
else
  log "Argo CD CLI is unavailable or not logged in; requesting sync through Kubernetes"
  clear_stale_operation "${RUNTIME_APP}"
  clear_stale_operation "${STAGING_APP}"
  request_kubectl_sync "${RUNTIME_APP}"
  request_kubectl_sync "${STAGING_APP}"
fi

deadline=$((SECONDS + WAIT_TIMEOUT_SECONDS))

while true; do
  status="$(
    kubectl get application "${STAGING_APP}" \
      --namespace "${ARGOCD_NAMESPACE}" \
      -o jsonpath='{.status.sync.status}{" "}{.status.health.status}' 2>/dev/null ||
      true
  )"

  if [ "${status}" = "Synced Healthy" ]; then
    log "PASS: ${STAGING_APP} is Synced and Healthy"
    exit 0
  fi

  if [ "${SECONDS}" -ge "${deadline}" ]; then
    kubectl get applications.argoproj.io \
      --namespace "${ARGOCD_NAMESPACE}" ||
      true

    print_app_diagnostics "${RUNTIME_APP}"
    print_app_diagnostics "${STAGING_APP}"

    kubectl describe application "${STAGING_APP}" \
      --namespace "${ARGOCD_NAMESPACE}" |
      tail -120 ||
      true

    die "Timed out waiting for ${STAGING_APP}; current status: ${status:-unknown}"
  fi

  log "Waiting for ${STAGING_APP}; current status: ${status:-unknown}"
  sleep "${POLL_SECONDS}"
done
