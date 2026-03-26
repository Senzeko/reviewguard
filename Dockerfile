# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci --omit=dev
RUN cd client && npm ci --omit=dev

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci
RUN cd client && npm ci
COPY . .
RUN npm run build
RUN cd client && npm run build

# ── Stage 3: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY package.json ./

RUN mkdir -p /app/evidence_vault

# Non-root user for security
RUN addgroup -g 1001 -S reviewguard && \
    adduser -S reviewguard -u 1001 -G reviewguard && \
    chown -R reviewguard:reviewguard /app
USER reviewguard

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
