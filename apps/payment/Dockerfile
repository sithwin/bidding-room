FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/payment/package.json ./apps/payment/
COPY packages/ ./packages/
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/payment rebuild
COPY apps/payment/ ./apps/payment/
RUN pnpm exec turbo run build --filter=@carat-room/payment

FROM node:22-alpine
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/payment/dist ./apps/payment/dist
COPY --from=builder --chown=node:node /app/apps/payment/migrations ./apps/payment/migrations
COPY --from=builder --chown=node:node /app/apps/payment/node_modules ./apps/payment/node_modules
COPY --from=builder --chown=node:node /app/apps/payment/package.json ./apps/payment/package.json
WORKDIR /app/apps/payment
USER node
EXPOSE 3004
CMD ["node", "dist/main.js"]
