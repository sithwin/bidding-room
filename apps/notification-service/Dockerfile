FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/notification-service/ ./apps/notification-service/

FROM base AS deps
RUN pnpm install --frozen-lockfile

FROM deps AS builder
RUN pnpm --filter @carat-room/notification-service build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/notification-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3005
CMD ["node", "dist/main.js"]
