FROM node:20-bookworm-slim

WORKDIR /app

# Install ALL deps (dev + prod) so vite/esbuild run during build
COPY package.json package-lock.json* ./
RUN npm install --omit=dev: false 2>&1 | tail -8

COPY . .
RUN npm run build 2>&1 | tail -20

# Railway passes PORT; listen on 8080
ENV PORT=8080
EXPOSE 8080

CMD ["node", "preflight-server.js"]
