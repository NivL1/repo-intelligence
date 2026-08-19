# syntax=docker/dockerfile:1

# Debian-slim (glibc), not alpine (musl): onnxruntime-node's native binding
# (pulled in by @xenova/transformers for the onnx embeddings provider)
# ships prebuilt against glibc and fails to load under musl at runtime
# ("Error loading shared library ld-linux-aarch64.so.1").
FROM node:20-slim AS builder
WORKDIR /app
# --chown matters here: several source dotfiles (tsconfig.json,
# .eslintrc.js) are 600 on disk. COPY preserves that mode, and once
# root-owned in the image the non-root `node` user below can't read them
# — which breaks ts-node at *runtime* for anything using this stage
# directly (e.g. the `migrate` compose service running migration:run).
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
COPY --chown=node:node . .
RUN npm run build
USER node

# Builds the dashboard separately from the API: different toolchain
# (Vite/React, no native deps at all), and its only output the runtime
# stage needs is the static dist/ folder — there's no reason to drag a
# second copy of client/node_modules into the final image.
FROM node:20-slim AS client-builder
WORKDIR /app/client
COPY --chown=node:node client/package.json client/package-lock.json ./
RUN npm ci
COPY --chown=node:node client/ .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# WorkspaceService shells out to `git clone` to fetch repositories for
# analysis, and node:20-slim ships without git — without this, registering
# any remote repository fails at runtime with "git: not found". It also
# ships without a CA bundle, which surfaces as a much more confusing
# failure ("server certificate verification failed: CAfile: none") on the
# first https:// clone rather than at build time — ca-certificates fixes
# that.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder --chown=node:node /app/dist ./dist
# Served by ServeStaticModule (see app.module.ts) at the same origin and
# port as the API — no separate dashboard container or CORS setup needed
# in production, unlike local dev where the Vite dev server runs on its
# own port.
COPY --from=client-builder --chown=node:node /app/client/dist ./client-dist
# WORKSPACE_DIR and ONNX_CACHE_DIR are created here with node:node
# ownership: WORKDIR itself is created by root, so without this the
# non-root `node` user below gets EACCES — on .workspace the first time it
# clones a repository, and on .cache the first time it loads the ONNX
# model (whose OWN default cache dir is inside node_modules, root-owned,
# which is why ONNX_CACHE_DIR redirects it here instead).
RUN mkdir -p /app/.workspace /app/.cache && chown node:node /app/.workspace /app/.cache
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
