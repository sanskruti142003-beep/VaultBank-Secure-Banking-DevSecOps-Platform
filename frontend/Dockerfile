FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY . .
RUN npm run build

FROM nginx:1.25-alpine AS production
RUN rm -f /etc/nginx/conf.d/default.conf \
  && mkdir -p /var/cache/nginx /var/run /tmp/nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /var/cache/nginx /var/run /tmp/nginx /usr/share/nginx/html /etc/nginx/conf.d
EXPOSE 8080
USER nginx
CMD ["nginx", "-g", "daemon off;"]
