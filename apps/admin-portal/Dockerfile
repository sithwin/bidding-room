FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json vitest.shared.ts ./
COPY apps/admin-portal/package.json ./apps/admin-portal/
COPY packages/ ./packages/
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/admin-portal rebuild
COPY apps/admin-portal/ ./apps/admin-portal/
RUN pnpm exec turbo run build --filter=@carat-room/admin-portal

FROM node:22-alpine
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/admin-portal/.next ./apps/admin-portal/.next
COPY --from=builder --chown=node:node /app/apps/admin-portal/node_modules ./apps/admin-portal/node_modules
COPY --from=builder --chown=node:node /app/apps/admin-portal/package.json ./apps/admin-portal/package.json
COPY --from=builder --chown=node:node /app/apps/admin-portal/next.config.* ./apps/admin-portal/
WORKDIR /app/apps/admin-portal
USER node
EXPOSE 3008
CMD ["node_modules/.bin/next", "start", "-p", "3008"]
