# Marketing site (Vite + TanStack Start, SSR) served by Nitro's node-server
# preset — the repo's default build targets Cloudflare Workers, which is not
# what the self-hosted deployment runs.
FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .
ENV NITRO_PRESET=node-server
RUN bun run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=build /app/.output ./.output

RUN addgroup -g 1001 chara && adduser -u 1001 -G chara -s /bin/sh -D chara
USER chara

EXPOSE 3000

# /api/health, not /: the app answers it before the SSR handler and does not
# write an access-log line for it. Probing / made the healthcheck the single
# largest source of "page views" in the analytics dashboard (see src/server.ts).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
