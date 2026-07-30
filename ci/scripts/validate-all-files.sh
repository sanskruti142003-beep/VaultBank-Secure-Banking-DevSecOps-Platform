#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${ROOT_DIR}"

failures=0

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

record_if_nonempty() {
  local label="$1"
  local file="$2"
  if [ -s "${file}" ]; then
    printf '\n%s\n' "${label}" >&2
    cat "${file}" >&2
    fail "${label}"
  else
    pass "${label}"
  fi
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

git ls-files > "${tmp_dir}/tracked-files.txt"
tracked_count="$(wc -l < "${tmp_dir}/tracked-files.txt" | tr -d ' ')"
pass "tracked file inventory collected (${tracked_count} files)"

git ls-files |
  grep -E '(^|/)(\.env($|\.)|terraform\.tfvars($|\.)|[^/]*\.(pem|key|p8|p12|pfx|jks|keystore)$|cosign\.key$)' |
  grep -Ev '(^|/)\.env(\.[^/]*)?\.example$|(^|/)\.env\.example$|(^|/)backend-service/nginx/certs/\.gitkeep$' \
    > "${tmp_dir}/tracked-secret-filenames.txt" || true
record_if_nonempty "no tracked secret-bearing filenames" "${tmp_dir}/tracked-secret-filenames.txt"

git ls-files |
  grep -E '(^|/)(node_modules|dist|coverage|\.trivy-cache|\.dependency-check-data)(/|$)|^reports/' \
    > "${tmp_dir}/tracked-generated-artifacts.txt" || true
record_if_nonempty "no tracked generated artifacts or scan reports" "${tmp_dir}/tracked-generated-artifacts.txt"

email_pattern='patilsonalias002@gmail\.com'
aws_access_key_pattern='A(KIA|SIA)[0-9A-Z]{16}'
private_key_pattern='BEGIN [A-Z0-9 ]*PRIVATE '
private_key_pattern="${private_key_pattern}KEY"
forbidden_pattern="${email_pattern}|${aws_access_key_pattern}|${private_key_pattern}"

git grep -I -nE "${forbidden_pattern}" -- \
  . \
  ':!backend-service/nginx/certs/*' \
  ':!reports/**' \
  ':!**/*.png' \
  ':!**/*.jpg' \
  ':!**/*.jpeg' \
  ':!**/*.gif' \
  ':!**/*.ico' \
  ':!**/*.pdf' \
  ':!**/*.zip' \
  > "${tmp_dir}/forbidden-content.txt" 2>/dev/null || true
record_if_nonempty "no forbidden personal email, AWS key pattern, or private-key header in tracked source" "${tmp_dir}/forbidden-content.txt"

: > "${tmp_dir}/bad-line-endings.txt"
while IFS= read -r file; do
  [ -f "${file}" ] || continue
  if LC_ALL=C grep -q $'\r' "${file}"; then
    printf '%s: CRLF line ending found\n' "${file}" >> "${tmp_dir}/bad-line-endings.txt"
  fi
  if [ "$(LC_ALL=C head -c 3 "${file}" | od -An -tx1 | tr -d ' \n')" = "efbbbf" ]; then
    printf '%s: UTF-8 BOM found\n' "${file}" >> "${tmp_dir}/bad-line-endings.txt"
  fi
done < <(
  {
    git ls-files '*.sh'
    git ls-files 'Jenkinsfile'
    git ls-files '.github/workflows/*.yml' '.github/workflows/*.yaml'
    git ls-files 'frontend/nginx.conf' 'backend-service/nginx/**/*.conf'
  } | sort -u
)
record_if_nonempty "CI, shell, and Nginx config files use LF without BOM" "${tmp_dir}/bad-line-endings.txt"

if [ "${failures}" -gt 0 ]; then
  printf '\nRepository-wide file hygiene scan failed with %s issue(s).\n' "${failures}" >&2
  exit 1
fi

printf '\nRepository-wide file hygiene scan passed.\n'
