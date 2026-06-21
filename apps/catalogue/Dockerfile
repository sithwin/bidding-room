FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/catalogue/ ./apps/catalogue/
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @carat-room/catalogue build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/catalogue/dist ./dist
COPY --from=builder /app/apps/catalogue/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3002
CMD ["node", "dist/main.js"]
