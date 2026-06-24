FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@9

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/admin-portal/package.json ./apps/admin-portal/
COPY packages/ ./packages/
RUN pnpm install --no-frozen-lockfile

FROM base
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin-portal/node_modules ./apps/admin-portal/node_modules
COPY apps/admin-portal/ ./apps/admin-portal/
WORKDIR /app/apps/admin-portal
EXPOSE 3006
CMD ["pnpm", "start"]
