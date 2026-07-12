FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/ ./packages/
COPY apps/auction-engine/ ./apps/auction-engine/
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/auction-engine rebuild
RUN pnpm --filter @carat-room/auction-engine build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
WORKDIR /app/apps/auction-engine
COPY --from=builder --chown=node:node /app/apps/auction-engine/dist ./dist
COPY --from=builder --chown=node:node /app/apps/auction-engine/package.json ./
COPY --from=builder --chown=node:node /app/apps/auction-engine/node_modules ./node_modules
USER node
EXPOSE 3003
CMD ["node", "dist/main.js"]
