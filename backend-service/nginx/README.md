# Banking API gateway

## Directory structure

```text
nginx/
├── nginx.conf
├── conf.d/
│   ├── upstream.conf
│   ├── rate-limit.conf
│   ├── security-headers.conf
│   ├── gzip.conf
│   ├── ssl.conf
│   ├── banking-api.conf
│   └── banking-api-ssl.conf
├── snippets/
│   ├── proxy-params.conf
│   ├── internal-block.conf
│   └── cors.conf
├── certs/
│   ├── self-signed.crt
│   └── self-signed.key
├── html/errors/
│   ├── 400.json
│   ├── 401.json
│   ├── 403.json
│   ├── 404.json
│   ├── 429.json
│   └── 5xx.json
├── scripts/
│   ├── generate-certs.sh
│   ├── nginx-reload.sh
│   └── test-gateway.sh
├── production/
│   ├── cloudfront-ip-ranges.conf.example
│   ├── letsencrypt-location.conf.example
│   └── logrotate-nginx
├── logs/
├── Dockerfile
├── .env.example
└── PRODUCTION.md
```

## Routes

| Public path | Upstream |
| --- | --- |
| `/api/auth/*` | `auth-service:3001/v1/auth/*` |
| `/api/accounts/*` | `account-service:3002/v1/accounts/*` |
| `/api/transactions/*` | `transaction-service:3003/v1/transactions/*` |
| `/api/payments/*` | `payment-service:3004/v1/payments/*` |
| `/health/{service}` | corresponding service `/v1/health` |
| `/metrics/{service}` | corresponding service `/v1/metrics` |

`/internal` and `/internal/*` always return a JSON 403. Stripe and PayPal
webhooks bypass Nginx rate limiting and disable both proxy response buffering
and request buffering.

## Local setup

Development certificates are generated locally and are not tracked in Git.
Regenerate them after changing `NGINX_HOST`:

```bash
NGINX_HOST=localhost sh nginx/scripts/generate-certs.sh nginx/certs
```

After the infrastructure, Vault bootstrap, migrations, and application
containers are ready:

```bash
docker compose up -d --build nginx
sh nginx/scripts/test-gateway.sh
```

The gateway is available at:

- `http://localhost:8080` — health only; all other routes redirect
- `https://localhost` — API gateway

The browser will warn about the development certificate. Do not disable TLS
verification in production.

## Reload

```bash
docker exec banking-nginx nginx -t
docker exec banking-nginx nginx -s reload
```

See `PRODUCTION.md` for Let's Encrypt, CloudFront/WAF, worker tuning, and log
rotation guidance.
