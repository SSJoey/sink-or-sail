# Stage 1: install everything and build the client with Vite.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY shared shared
COPY client client
RUN npm run build

# Stage 2: server runtime only. Node runs the .ts files directly (type stripping).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w @sink-or-sail/server
COPY shared/src shared/src
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
RUN mkdir -p logs && chown node:node logs
USER node
EXPOSE 2567
CMD ["node", "server/src/index.ts"]
