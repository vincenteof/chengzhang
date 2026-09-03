FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    MEDIA_DIR=/data/media
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json /app/tsconfig.node.json ./
RUN chmod +x /app/scripts/docker-entrypoint.sh \
  && mkdir -p /data/media
EXPOSE 3000
VOLUME ["/data/media"]
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
