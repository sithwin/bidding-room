FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json vitest.shared.ts ./
COPY apps/user-portal/package.json ./apps/user-portal/
COPY packages/ ./packages/
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/user-portal rebuild
COPY apps/user-portal/ ./apps/user-portal/
# Next.js/Turbopack inlines process.env.* reads from route handlers at build
# time - these must match the hostnames docker-compose.yml supplies at
# runtime, or the build-time fallback (e.g. http://localhost:3001) gets
# baked in permanently regardless of the container's actual runtime env.
ENV USER_SERVICE_URL=http://user-service:3001 \
    CATALOGUE_SERVICE_URL=http://catalogue-service:3002 \
    AUCTION_ENGINE_URL=http://auction-engine:3003 \
    PAYMENT_SERVICE_URL=http://payment-service:3004 \
    SHIPPING_SERVICE_URL=http://shipping-service:3006 \
    ADMIN_SERVICE_URL=http://admin-service:3007
RUN pnpm exec turbo run build --filter=@carat-room/user-portal

FROM node:22-alpine
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/user-portal/.next ./apps/user-portal/.next
COPY --from=builder --chown=node:node /app/apps/user-portal/node_modules ./apps/user-portal/node_modules
COPY --from=builder --chown=node:node /app/apps/user-portal/package.json ./apps/user-portal/package.json
COPY --from=builder --chown=node:node /app/apps/user-portal/next.config.* ./apps/user-portal/
WORKDIR /app/apps/user-portal
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
