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

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
