# Nginx production checklist

## Let's Encrypt

Use a real DNS name and mount `/etc/letsencrypt` into the gateway container.
The HTTP server must expose `/.well-known/acme-challenge/` from the same
webroot during issuance and renewal.

```bash
certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --domain api.yourdomain.com \
  --email operations@yourdomain.com \
  --agree-tos \
  --no-eff-email
```

Replace the local directives in `conf.d/ssl.conf`:

```nginx
ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
ssl_trusted_certificate /etc/letsencrypt/live/api.yourdomain.com/chain.pem;
```

Example root cron entry:

```cron
17 3 * * * certbot renew --quiet --deploy-hook "docker exec banking-nginx nginx -t && docker exec banking-nginx nginx -s reload"
```

## CloudFront and AWS WAF

In Phase 3, CloudFront and AWS WAF sit in front of Nginx. Restrict the origin so
only current CloudFront edge ranges can connect:

```nginx
include /etc/nginx/cloudfront/cloudfront-ip-ranges.conf;
deny all;
```

The generated include contains one `allow CIDR;` line per AWS
`CLOUDFRONT` range. Refresh it from the signed AWS `ip-ranges.json` feed as a
scheduled deployment task, validate the new configuration, then reload Nginx.
Also configure the load balancer or firewall security group to enforce the same
restriction; Nginx allowlists are a second layer.

## Worker and file descriptor tuning

Production defaults:

```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    use epoll;
    worker_connections 65535;
    multi_accept on;
}
```

The container runtime and host must also grant a matching `nofile` limit.

## Log rotation

Install `production/logrotate-nginx` as `/etc/logrotate.d/banking-nginx` on the
Docker host. It rotates daily, compresses old files, and retains 30 days. For a
managed deployment, prefer shipping the JSON access stream directly to the
central log platform instead of retaining it on the instance.

## Safe reload procedure

Always validate before applying a reload:

```bash
docker exec banking-nginx nginx -t
docker exec banking-nginx nginx -s reload
```

Never reload after a failed configuration test.

## Additional production controls

- Replace the development certificate and private key.
- Replace `yourdomain.com` in the CORS allowlist with the exact deployed UI
  origins.
- Put secrets and certificates in the platform secret store, not the image.
- Restrict ports 3001–3004 and all data-service ports to the private network.
- Monitor 429, 499, and 5xx rates plus upstream response latency.
- Keep Nginx patched; the requested `1.25` image is retained for local parity,
  but production should track an actively supported release after validation.
- Vanilla Nginx cannot extract the JWT `sub` claim. The included user limiter
  keys authenticated traffic by bearer token. True subject-based limiting
  belongs in the application or an authentication-aware edge component.
