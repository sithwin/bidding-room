FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/user-auth/package.json ./apps/user-auth/
COPY packages/ ./packages/
RUN npm install -g pnpm@9 && pnpm install --no-frozen-lockfile
COPY apps/user-auth/ ./apps/user-auth/
RUN pnpm --filter @carat-room/user-auth build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/apps/user-auth/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/main.js"]
