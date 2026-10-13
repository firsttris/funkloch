# Funkloch: one image for amd64 and arm64. The build stage bundles the server into dist/, so the
# runtime stage needs only Bun, the bundle and the migrations.
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY project.inlang ./project.inlang
COPY messages ./messages
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8090 \
    DATA_DIR=/data \
    TZ=UTC
COPY --from=build /app/dist ./dist
COPY --from=build /app/serve.ts ./serve.ts
COPY --from=build /app/src/db/migrations ./src/db/migrations
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT || 8090) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["bun", "serve.ts"]
