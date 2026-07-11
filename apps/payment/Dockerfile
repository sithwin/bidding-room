FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/payment/package.json ./apps/payment/
COPY packages/ ./packages/
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/payment rebuild
COPY apps/payment/ ./apps/payment/
RUN pnpm --filter @carat-room/payment build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/payment/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
USER node
EXPOSE 3004
CMD ["node", "dist/main.js"]
