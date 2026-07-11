FROM node:22-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/ ./packages/
COPY apps/notification-service/ ./apps/notification-service/

FROM base AS deps
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/notification-service rebuild

FROM deps AS builder
RUN pnpm --filter @carat-room/notification-service build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/notification-service/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
USER node
EXPOSE 3005
CMD ["node", "dist/main.js"]
