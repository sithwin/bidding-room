FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/admin/package.json ./apps/admin/
COPY packages/ ./packages/
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/admin rebuild
COPY apps/admin/ ./apps/admin/
RUN pnpm exec turbo run build --filter=@carat-room/admin

FROM node:22-alpine
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/admin/dist ./apps/admin/dist
COPY --from=builder --chown=node:node /app/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=builder --chown=node:node /app/apps/admin/package.json ./apps/admin/package.json
WORKDIR /app/apps/admin
USER node
EXPOSE 3007
CMD ["node", "dist/main.js"]
