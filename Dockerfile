FROM node:20-bookworm-slim

WORKDIR /app

# Install ALL deps via NODE_ENV=development (no --omit flag ambiguity)
COPY package.json package-lock.json* ./
RUN NODE_ENV=development npm install 2>&1 | tail -8

# Copy source and build → dist/boot.js
COPY . .
RUN npm run build 2>&1 | tail -20

ENV PORT=8080
EXPOSE 8080

CMD ["node", "preflight-server.js"]
