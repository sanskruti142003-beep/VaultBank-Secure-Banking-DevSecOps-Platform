#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ci/scripts/devsecops-common.sh
source "${SCRIPT_DIR}/devsecops-common.sh"

ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
STAGING_NAMESPACE="${STAGING_NAMESPACE:-vault-bank-staging}"
STAGING_APP="${STAGING_APP:-vault-bank-staging}"
RUNTIME_APP="${RUNTIME_APP:-vault-bank-runtime-staging}"
TARGET_REVISION="${ARGOCD_TARGET_REVISION:-main}"
WAIT_TIMEOUT_SECONDS="${ARGOCD_WAIT_TIMEOUT_SECONDS:-300}"
POLL_SECONDS="${ARGOCD_POLL_SECONDS:-10}"

require_command kubectl
require_command grep
require_command sed
require_command tail

STAGING_RENDERED_MANIFEST="$(
  mktemp /tmp/vault-bank-staging-rendered.XXXXXX.yaml
)"

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

if [ "${TARGET_REVISION}" != "main" ]; then
  log "Temporarily setting Argo CD staging target revision to ${TARGET_REVISION}"
  for app in "${RUNTIME_APP}" "${STAGING_APP}"; do
    kubectl patch application "${app}" \
      --namespace "${ARGOCD_NAMESPACE}" \
      --type merge \
      --patch "{\"spec\":{\"source\":{\"targetRevision\":\"${TARGET_REVISION}\"}}}" \
      >/dev/null
  done
fi

log "Verifying staging overlay renders without PreSync migration or ZAP seed hooks"
kubectl kustomize "${ROOT_DIR}/gitops/overlays/staging" \
  > "${STAGING_RENDERED_MANIFEST}"

[ -s "${STAGING_RENDERED_MANIFEST}" ] ||
  die "Rendered staging manifest is empty"

if grep -Eq \
  '(^kind: Job$|argocd\.argoproj\.io/hook|vault-bank-database-migration|vault-bank-zap-customer-seed|banking-migrator-secrets|zap-staging-customer)' \
  "${STAGING_RENDERED_MANIFEST}"; then

  die "Rendered staging manifest still contains a PreSync migration/ZAP seed dependency"
fi

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
      "revision": "${TARGET_REVISION}",
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

publish_staging_ingress_status() {
  local node_ip
  local ingress
  local patched=0

  if [ "${INGRESS_STATUS_PUBLISHED:-0}" = "1" ]; then
    return 0
  fi

  node_ip="$(
    kubectl get nodes \
      -o jsonpath='{range .items[*]}{range .status.addresses[?(@.type=="InternalIP")]}{.address}{"\n"}{end}{end}' |
      sed -n '1p'
  )"

  if [ -z "${node_ip}" ]; then
    log "WARN: unable to discover k3s node InternalIP for staging Ingress status"
    return 0
  fi

  for ingress in \
    vaultbank-api-http \
    vaultbank-api-https \
    vaultbank-frontend-http \
    vaultbank-frontend-https; do

    kubectl get ingress "${ingress}" \
      --namespace "${STAGING_NAMESPACE}" \
      >/dev/null 2>&1 ||
      continue

    if kubectl patch ingress "${ingress}" \
      --namespace "${STAGING_NAMESPACE}" \
      --subresource=status \
      --type merge \
      --patch "{\"status\":{\"loadBalancer\":{\"ingress\":[{\"ip\":\"${node_ip}\"}]}}}" \
      >/dev/null 2>&1; then

      patched=$((patched + 1))
    else
      log "WARN: unable to publish status for staging Ingress ${ingress}"
    fi
  done

  if [ "${patched}" -gt 0 ]; then
    INGRESS_STATUS_PUBLISHED=1
    log "Published k3s node IP ${node_ip} to ${patched} staging Ingress status record(s)"
  fi
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

publish_staging_ingress_status

deadline=$((SECONDS + WAIT_TIMEOUT_SECONDS))

while true; do
  publish_staging_ingress_status

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
