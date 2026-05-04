# Build Stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies strictly
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Production Stage
FROM node:18-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

# Copy built artifacts from builder stage
COPY --from=builder /app/server ./server
COPY --from=builder /app/contracts ./contracts
COPY --from=builder /app/admin ./admin
COPY --from=builder /app/index.html .
COPY --from=builder /app/.env.example .

# Frontend assets (BG-Wealth rebranded)
COPY --from=builder /app/bg-wealth-styles.css .
COPY --from=builder /app/bg-wealth-app.js .
COPY --from=builder /app/particle-bg.js .
COPY --from=builder /app/script.js .
COPY --from=builder /app/style.css .
COPY --from=builder /app/*.png .
COPY --from=builder /app/*.jpg .
COPY --from=builder /app/*.svg .
COPY --from=builder /app/*.ico .

# Expose port
EXPOSE 3000

# Run as non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

# Start command
CMD ["npm", "start"]
