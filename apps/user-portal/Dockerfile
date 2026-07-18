FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/user-portal/package.json ./apps/user-portal/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @carat-room/user-portal rebuild

FROM base
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/apps/user-portal/node_modules ./apps/user-portal/node_modules
COPY --chown=node:node apps/user-portal/ ./apps/user-portal/
WORKDIR /app/apps/user-portal
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
