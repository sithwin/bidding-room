FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json vitest.shared.ts ./
COPY apps/user-portal/package.json ./apps/user-portal/
COPY packages/ ./packages/
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/user-portal rebuild
COPY apps/user-portal/ ./apps/user-portal/
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
