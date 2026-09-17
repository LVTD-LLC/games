FROM node:24-alpine
WORKDIR /app
COPY services/corporate-bs-api/ ./
RUN mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=80 DATABASE_PATH=/data/corporate-bs.sqlite
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/api/corporate-bs/health || exit 1
CMD ["node", "server.mjs"]
