FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/user-auth/package.json ./apps/user-auth/
COPY packages/ ./packages/
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/user-auth rebuild
COPY apps/user-auth/ ./apps/user-auth/
RUN pnpm --filter @carat-room/user-auth... build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/user-auth/dist ./apps/user-auth/dist
COPY --from=builder --chown=node:node /app/apps/user-auth/migrations ./apps/user-auth/migrations
COPY --from=builder --chown=node:node /app/apps/user-auth/node_modules ./apps/user-auth/node_modules
WORKDIR /app/apps/user-auth
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
