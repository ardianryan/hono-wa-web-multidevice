# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production Runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

LABEL maintainer="HonoWA"
LABEL org.opencontainers.image.title="HonoWA"
LABEL org.opencontainers.image.description="WhatsApp Web API with Hono.js"
LABEL org.opencontainers.image.source="https://github.com/user/hono-wa"

WORKDIR /app

RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libcups2 \
    fonts-liberation \
    libegl1 \
    libxshmfence1 \
    ca-certificates \
    curl \
    dumb-init \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r honowa && useradd -r -g honowa -d /app -s /sbin/nologin honowa

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DATABASE_URL=

COPY package*.json ./

RUN npm ci --include=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache /app/data /app/public/assets/uploads && \
    chown -R honowa:honowa /app

USER honowa

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:4000/login || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["sh", "-c", "find .wwebjs_auth -name 'SingletonLock' -exec rm -f {} + && node dist/index.js"]
