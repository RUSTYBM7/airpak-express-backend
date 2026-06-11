FROM node:22-alpine AS base
WORKDIR /app

# ── deps ────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# ── runtime ─────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3001

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3001/health || exit 1

CMD ["node", "src/server.js"]
