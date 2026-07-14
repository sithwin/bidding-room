FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/shipping/package.json ./apps/shipping/
COPY packages/ ./packages/
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/shipping rebuild
COPY apps/shipping/ ./apps/shipping/
RUN pnpm --filter @carat-room/shipping... build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/shipping/dist ./apps/shipping/dist
COPY --from=builder --chown=node:node /app/apps/shipping/migrations ./apps/shipping/migrations
COPY --from=builder --chown=node:node /app/apps/shipping/node_modules ./apps/shipping/node_modules
WORKDIR /app/apps/shipping
USER node
EXPOSE 3006
CMD ["node", "dist/main.js"]
