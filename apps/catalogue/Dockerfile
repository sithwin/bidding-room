FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/ ./packages/
COPY apps/catalogue/ ./apps/catalogue/
RUN npm install -g pnpm@9 && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/catalogue rebuild
RUN pnpm --filter @carat-room/catalogue build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder --chown=node:node /app/apps/catalogue/dist ./dist
COPY --from=builder --chown=node:node /app/apps/catalogue/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
USER node
EXPOSE 3002
CMD ["node", "dist/main.js"]
