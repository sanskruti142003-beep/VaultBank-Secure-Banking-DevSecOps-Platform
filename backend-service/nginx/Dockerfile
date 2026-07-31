FROM alpine:3.19 AS cert-gen

RUN apk add --no-cache openssl

ARG NGINX_HOST=localhost
ENV NGINX_HOST=${NGINX_HOST}

COPY scripts/generate-certs.sh /usr/local/bin/generate-certs.sh
RUN chmod +x /usr/local/bin/generate-certs.sh \
    && /usr/local/bin/generate-certs.sh /certs

FROM nginx:1.25-alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/
COPY snippets/ /etc/nginx/snippets/
COPY html/ /etc/nginx/html/
COPY --from=cert-gen --chown=nginx:nginx /certs/ /etc/nginx/certs/
COPY scripts/nginx-reload.sh /usr/local/bin/nginx-reload

RUN chmod +x /usr/local/bin/nginx-reload \
    && mkdir -p /var/cache/nginx /tmp/nginx \
    && chown -R nginx:nginx \
        /var/cache/nginx \
        /tmp/nginx \
        /etc/nginx/certs \
    && chmod 640 /etc/nginx/certs/self-signed.key

EXPOSE 8080 8443

USER nginx

CMD ["nginx", "-g", "daemon off;"]
