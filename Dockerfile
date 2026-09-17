FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm run setup && npm run build

FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY services/ ./services/
COPY --from=build /app/dist ./dist/
USER node
ENV NODE_ENV=production PORT=80
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1/api/corporate-bs/health || exit 1
CMD ["node", "services/server.mjs"]
