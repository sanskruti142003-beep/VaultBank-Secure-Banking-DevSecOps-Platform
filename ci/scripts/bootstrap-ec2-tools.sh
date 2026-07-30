#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash ci/scripts/bootstrap-ec2-tools.sh" >&2
  exit 1
fi

apt-get update
apt-get install -y \
  ca-certificates curl gnupg git jq unzip make \
  docker.io docker-compose-plugin \
  openjdk-17-jre-headless

systemctl enable --now docker
usermod -aG docker "${SUDO_USER:-ubuntu}" || true

if ! command -v kubectl >/dev/null 2>&1; then
  curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
  chmod +x /usr/local/bin/kubectl
fi

if ! command -v kustomize >/dev/null 2>&1; then
  curl -fsSL "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" |
    bash
  mv kustomize /usr/local/bin/kustomize
fi

if ! command -v aws >/dev/null 2>&1; then
  tmp_dir="$(mktemp -d)"
  curl -fsSLo "${tmp_dir}/awscliv2.zip" "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"
  unzip -q "${tmp_dir}/awscliv2.zip" -d "${tmp_dir}"
  "${tmp_dir}/aws/install"
  rm -rf "${tmp_dir}"
fi

if ! command -v k3s >/dev/null 2>&1; then
  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --write-kubeconfig-mode=644" sh -
fi

echo "EC2 POC tools installed. Log out and back in for Docker group membership to apply."
