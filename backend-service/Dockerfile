FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM dependencies AS build
ARG SERVICE_NAME
COPY nest-cli.json tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY libs ./libs
RUN npx nest build "${SERVICE_NAME}"

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS production
WORKDIR /app
ENV NODE_ENV=production
ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
CMD ["sh", "-c", "node dist/apps/${SERVICE_NAME}/apps/${SERVICE_NAME}/src/main.js"]
