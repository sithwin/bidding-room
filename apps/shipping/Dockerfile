FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/shipping/package.json ./apps/shipping/
COPY packages/ ./packages/
RUN npm install -g pnpm@9 && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/shipping rebuild
COPY apps/shipping/ ./apps/shipping/
RUN pnpm --filter @carat-room/shipping build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/shipping/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
USER node
EXPOSE 3006
CMD ["node", "dist/main.js"]
