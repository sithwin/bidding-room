FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/auction-engine/ ./apps/auction-engine/
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @carat-room/auction-engine build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/auction-engine/dist ./dist
COPY --from=builder /app/apps/auction-engine/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3003
CMD ["node", "dist/main.js"]
