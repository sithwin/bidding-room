FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/shipping/package.json ./apps/shipping/
COPY packages/ ./packages/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY apps/shipping/ ./apps/shipping/
RUN pnpm --filter @carat-room/shipping build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/shipping/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3006
CMD ["node", "dist/main.js"]
