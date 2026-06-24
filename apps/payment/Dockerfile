FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/payment/package.json ./apps/payment/
COPY packages/ ./packages/
RUN npm install -g pnpm@9 && pnpm install --no-frozen-lockfile
COPY apps/payment/ ./apps/payment/
RUN pnpm --filter @carat-room/payment build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/apps/payment/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3004
CMD ["node", "dist/main.js"]
