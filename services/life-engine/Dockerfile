FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends clang ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/services/life-engine
COPY services/life-engine/package*.json ./
RUN npm ci --include=dev
COPY services/life-engine/ ./
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/services/life-engine/dist/ ./dist/
COPY services/life-engine/pool.mjs services/life-engine/server.mjs services/life-engine/revision.txt ./
USER node
ENV PORT=4180 HOST=0.0.0.0 BEND_THREADS=2
EXPOSE 4180
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:4180/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
