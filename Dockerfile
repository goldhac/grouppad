# ── Stage 1: compile native modules (better-sqlite3 needs gcc) ────────────────
FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: lean runtime image (no build tools) ──────────────────────────────
FROM node:20-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy compiled node_modules from builder (no g++ needed at runtime)
COPY --from=builder /app/node_modules ./node_modules
COPY . .

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
EXPOSE 3000
CMD ["node", "server.js"]
