FROM node:22.23.1-alpine3.24@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY . .
RUN npm run build

FROM nginx:stable-alpine3.24@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46 AS production
RUN rm -f /etc/nginx/conf.d/default.conf \
  && mkdir -p /var/cache/nginx /var/run /tmp/nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /var/cache/nginx /var/run /tmp/nginx /usr/share/nginx/html /etc/nginx/conf.d
EXPOSE 8080
USER nginx
CMD ["nginx", "-g", "daemon off;"]
