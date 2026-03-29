# PodSignal — production image (API + Vite client served from Fastify)
# Build: docker build -t podsignal .
# Run:  docker run -p 3000:3000 --env-file .env podsignal

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
RUN npm ci && cd client && npm ci

COPY . .
RUN npm run build:server && npm run client:build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/db/schema.ts ./src/db/schema.ts

RUN mkdir -p evidence_vault media_vault

EXPOSE 3000
CMD ["node", "dist/index.js"]
