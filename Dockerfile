# syntax=docker/dockerfile:1

# ---- Stage 1: build ---------------------------------------------------------
# Full node image so native modules (better-sqlite3) build if no prebuilt binary
# is available, and so we can build the Vite client. Bun is used as the package
# manager/installer (the repo ships bun.lock); the runtime stays Node.
FROM node:22-bookworm AS build
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

# Install ALL dependencies (including dev) for the client build.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the client (Vite). VITE_TLDRAW_LICENSE_KEY is a build-time var; pass it
# with --build-arg to bake a license key into the bundle (optional).
ARG VITE_TLDRAW_LICENSE_KEY
ENV VITE_TLDRAW_LICENSE_KEY=${VITE_TLDRAW_LICENSE_KEY}
COPY . .
RUN bun run build-client

# ---- Stage 2: production dependencies --------------------------------------
# Reinstall only production deps; this rebuilds better-sqlite3 against node:22.
FROM node:22-bookworm AS prod-deps
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---- Stage 3: runtime -------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

# Production node_modules (with compiled better-sqlite3) + built client + server.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY src/server ./src/server

# Data directory (mounted as a volume in production).
RUN mkdir -p /data && chown -R node:node /app /data
USER node
VOLUME ["/data"]
EXPOSE 3000

# Run the server with tsx (TypeScript executed directly; no bundling needed and
# native modules keep working).
CMD ["node_modules/.bin/tsx", "src/server/server.ts"]
