FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/ ./packages/
COPY apps/catalogue/ ./apps/catalogue/
RUN npm install -g pnpm@9 && pnpm install --no-frozen-lockfile
RUN pnpm --filter @carat-room/catalogue build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/apps/catalogue/dist ./dist
COPY --from=builder /app/apps/catalogue/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3002
CMD ["node", "dist/main.js"]
