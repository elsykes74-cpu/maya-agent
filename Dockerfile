# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

# Install all deps including devDependencies for build tools
WORKDIR /app
COPY package.json package-lock.json* .npmrc ./
RUN npm install --include=dev 2>&1 | tail -5

# Copy source
COPY . .

# Build: vite + esbuild → dist/boot.js
RUN npm run build 2>&1 | tail -20

# Expose Railway's port
EXPOSE 8080

# Zero-dep preflight entry: survives crashes, reports env/diagnostics
CMD ["node", "preflight-server.js"]
