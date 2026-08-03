FROM node:22.23.1-alpine3.24@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM dependencies AS build
ARG SERVICE_NAME
COPY nest-cli.json tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY libs ./libs
RUN npx nest build "${SERVICE_NAME}"

FROM node:22.23.1-alpine3.24@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS production
WORKDIR /app
ENV NODE_ENV=production
ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps \
    && npm cache clean --force \
    && rm -rf \
        /root/.npm \
        /home/node/.npm \
        /usr/local/lib/node_modules/npm \
        /usr/local/share/doc/npm \
    && rm -f \
        /usr/local/bin/npm \
        /usr/local/bin/npx \
        /usr/local/share/man/man1/npm* \
        /usr/local/share/man/man1/npx*
COPY --from=build /app/dist ./dist
USER node
CMD ["sh", "-c", "node dist/apps/${SERVICE_NAME}/apps/${SERVICE_NAME}/src/main.js"]
