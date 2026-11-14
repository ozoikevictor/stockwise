FROM node:22-bookworm-slim AS web
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN STOCKWISE_WEB_BUILD=1 VITE_ONLINE_ONLY=true npx vite build --config desktop/vite.renderer.config.ts

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3003 WEB_ROOT=/app/web
WORKDIR /app/backend/server
COPY backend/server/package.json backend/server/package-lock.json ./
RUN npm ci --include=dev
COPY backend/server/src ./src
COPY backend/server/migrations ./migrations
COPY --from=web /build/frontend/dist-web /app/web
USER node
EXPOSE 3003
CMD ["sh", "-c", "npm run migrate && exec npm start"]
