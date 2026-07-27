#!/bin/sh
set -eu

HTTP_BASE="${HTTP_BASE:-http://localhost}"
HTTPS_BASE="${HTTPS_BASE:-https://localhost}"
CURL="${CURL:-curl}"

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

status() {
  "$CURL" -ksS -o "$2" -w '%{http_code}' "$1"
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

printf '\n1. HTTP to HTTPS redirect\n'
headers="$tmp_dir/redirect.headers"
"$CURL" -sS -D "$headers" -o /dev/null "$HTTP_BASE/api/auth/login"
grep -Eq '^HTTP/.* 301' "$headers" || fail 'HTTP request was not redirected'
grep -Eqi '^Location: https://' "$headers" || fail 'HTTPS Location header missing'
pass 'HTTP redirects to HTTPS'

printf '\n2. Invalid route returns JSON 404\n'
body="$tmp_dir/not-found.json"
code="$(status "$HTTPS_BASE/api/nonexistent" "$body")"
[ "$code" = '404' ] || fail "Expected 404, received $code"
grep -q '"code":"NOT_FOUND"' "$body" || fail 'JSON NOT_FOUND error missing'
pass 'Invalid API route returns JSON 404'

printf '\n3. Internal route is blocked\n'
body="$tmp_dir/forbidden.json"
code="$(status "$HTTPS_BASE/internal/accounts/123" "$body")"
[ "$code" = '403' ] || fail "Expected 403, received $code"
grep -q '"code":"FORBIDDEN"' "$body" || fail 'JSON FORBIDDEN error missing'
pass 'Internal route returns JSON 403'

printf '\n4. Auth login is proxied\n'
body="$tmp_dir/login.json"
code="$(
  "$CURL" -ksS \
    -o "$body" \
    -w '%{http_code}' \
    -X POST "$HTTPS_BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"test@test.com","password":"Test1234!"}'
)"
case "$code" in
  400|401|403|429) pass "Auth service responded through gateway with HTTP $code" ;;
  *) fail "Unexpected login response $code; expected a proxied application response" ;;
esac

printf '\n5. Auth rate limit eventually returns 429\n'
rate_limited=false
i=1
while [ "$i" -le 10 ]; do
  code="$(
    "$CURL" -ksS \
      -o "$tmp_dir/rate-$i.json" \
      -w '%{http_code}' \
      -X POST "$HTTPS_BASE/api/auth/login" \
      -H 'Content-Type: application/json' \
      -d '{"email":"test@test.com","password":"wrong"}'
  )"
  if [ "$code" = '429' ]; then
    grep -q '"code":"RATE_LIMIT_EXCEEDED"' "$tmp_dir/rate-$i.json" ||
      fail '429 response did not contain RATE_LIMIT_EXCEEDED'
    rate_limited=true
    break
  fi
  i=$((i + 1))
done
[ "$rate_limited" = true ] || fail 'Auth rate limit did not trigger'
pass 'Auth burst is rate limited'

printf '\n6. Gateway health\n'
body="$tmp_dir/gateway-health.json"
code="$(status "$HTTPS_BASE/health" "$body")"
[ "$code" = '200' ] || fail "Expected gateway health 200, received $code"
grep -q '"service":"nginx-gateway"' "$body" || fail 'Gateway health body missing'
pass 'Gateway health returns 200'

printf '\n7. Upstream service health checks\n'
for service in auth accounts transactions payments; do
  body="$tmp_dir/health-$service.json"
  code="$(status "$HTTPS_BASE/health/$service" "$body")"
  [ "$code" = '200' ] || fail "$service health returned $code"
  pass "$service health returns 200"
done

printf '\n8. CORS preflight\n'
headers="$tmp_dir/cors.headers"
"$CURL" -ksS -D "$headers" -o /dev/null \
  -X OPTIONS "$HTTPS_BASE/api/auth/login" \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type,Authorization'
grep -Eq '^HTTP/.* 204' "$headers" || fail 'CORS preflight did not return 204'
grep -Eqi '^Access-Control-Allow-Origin: http://localhost:5173' "$headers" ||
  fail 'Allowed CORS origin was not returned'
pass 'CORS preflight returns explicit allowed origin'

printf '\n9. Security headers\n'
headers="$tmp_dir/security.headers"
"$CURL" -ksS -D "$headers" -o /dev/null "$HTTPS_BASE/health"
for header in X-Frame-Options X-Content-Type-Options X-XSS-Protection Strict-Transport-Security; do
  grep -Eqi "^$header:" "$headers" || fail "$header header missing"
done
pass 'Security headers are present'

printf '\n10. Correlation ID propagation\n'
headers="$tmp_dir/correlation.headers"
"$CURL" -ksS -D "$headers" -o /dev/null \
  "$HTTPS_BASE/health" \
  -H 'X-Correlation-ID: gateway-test-correlation'
grep -Eqi '^X-Correlation-ID: gateway-test-correlation' "$headers" ||
  fail 'Correlation ID was not preserved in the response'
pass 'Correlation ID is returned to the client'

printf '\nAll gateway tests passed.\n'
