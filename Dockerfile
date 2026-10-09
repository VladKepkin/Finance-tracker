# syntax=docker/dockerfile:1

# 1. Базовий шар з Node 20 Bookworm Slim
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 2. Шар залежностей (встановлює python3, make, g++ для компіляції нативного better-sqlite3)
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# 3. Шар збірки проєкту (Next.js standalone bundle)
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build

# 4. Продакшн ранер: мінімальний розмір (~180MB), безпечний non-root користувач (node: 1000)
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_PATH=/app/data/money.db

# Встановлюємо curl для docker healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Створюємо директорії та надаємо права вбудованому користувачу node (UID 1000)
RUN mkdir -p /app/data /app/public && chown -R node:node /app

# Копіюємо скомпільований автономний сервер Next.js та статичні файли
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/login || exit 1

CMD ["node", "server.js"]
