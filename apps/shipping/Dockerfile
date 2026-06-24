FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/shipping/package.json ./apps/shipping/
COPY packages/ ./packages/
RUN npm install -g pnpm@9 && pnpm install --no-frozen-lockfile
COPY apps/shipping/ ./apps/shipping/
RUN pnpm --filter @carat-room/shipping build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/apps/shipping/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3006
CMD ["node", "dist/main.js"]
