FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/admin/package.json ./apps/admin/
COPY packages/ ./packages/
RUN npm install -g pnpm@9 && pnpm install --no-frozen-lockfile
COPY apps/admin/ ./apps/admin/
RUN pnpm --filter @carat-room/admin build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/apps/admin/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3007
CMD ["node", "dist/main.js"]
