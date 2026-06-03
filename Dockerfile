# --- Build ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .

# --- Run ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/index.js ./
COPY --from=builder /app/Modelfile ./
COPY --from=builder /app/deploy-commands.js ./
COPY --from=builder /app/commands ./commands
COPY --from=builder /app/events ./events
COPY --from=builder /app/src ./src

USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "process.exit(0)"
CMD ["node", "index.js"]
