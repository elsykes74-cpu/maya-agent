FROM node:20-bookworm-slim

WORKDIR /app

# Install ALL deps via NODE_ENV=development (no --omit flag ambiguity)
COPY package.json package-lock.json* ./
RUN NODE_ENV=development npm install 2>&1 | tail -8

# Copy source and build → dist/boot.js
COPY . .
RUN npm run build 2>&1 | tail -20

# Railway sets $PORT at runtime; Hono reads it in api/boot.ts:252
EXPOSE 8080

# Before: "preflight-server.js" — this file never existed here.
# Now: run the actual built API server entry point.
# Use start.mjs wrapper for better error reporting on Railway
# Use debug wrapper — logs go to stdout for Railway runtime logs
CMD ["node", "start-debug.mjs"]
