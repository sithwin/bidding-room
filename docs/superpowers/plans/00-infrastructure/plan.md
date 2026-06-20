# Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the monorepo, Docker Compose stack, Nginx reverse proxy, and CI/CD pipeline that every other domain depends on.

**Architecture:** Single Hetzner VM running all services as Docker containers orchestrated by Docker Compose. Nginx handles SSL termination and routes requests to services by path prefix. GitHub Actions deploys on push to `main` via SSH.

**Tech Stack:** Turborepo, pnpm workspaces, Docker Compose, Nginx, PostgreSQL 16, Redis 7, RabbitMQ 3.13, Let's Encrypt (Certbot), GitHub Actions

## Global Constraints

- Node.js >= 20
- TypeScript >= 5.4
- pnpm >= 9
- All services use Hono as HTTP framework
- All services communicate state changes via RabbitMQ domain events — no direct DB access across service boundaries
- British English in all copy and comments
- No `var` — always `const` or `let`
- Named exports only — no `export default`

---

### Task 1: Initialise Turborepo Monorepo

**Files:**
- Create: `package.json` (root)
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `apps/` (directory)
- Create: `packages/` (directory)

**Interfaces:**
- Produces: monorepo root with `apps/` and `packages/` workspace directories, `turbo build` and `turbo test` pipeline configured

- [ ] **Step 1: Initialise the monorepo**

```bash
npx create-turbo@latest . --package-manager pnpm
```

When prompted, select "Empty workspace".

- [ ] **Step 2: Replace the generated `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {}
  }
}
```

- [ ] **Step 3: Replace the generated root `package.json`**

```json
{
  "name": "the-carat-room",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "dev": "turbo dev",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.env
.env.*
!.env.example
*.log
.turbo/
.DS_Store
*.pem
```

- [ ] **Step 5: Remove any example apps Turborepo generated**

```bash
rm -rf apps/web apps/docs packages/ui packages/eslint-config packages/typescript-config
mkdir -p apps packages
```

- [ ] **Step 6: Verify workspace**

```bash
pnpm install
pnpm turbo build
```

Expected output: "No tasks were executed" — correct, no apps exist yet.

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "chore: initialise Turborepo monorepo"
```

---

### Task 2: Shared TypeScript Config Package

**Files:**
- Create: `packages/tsconfig/package.json`
- Create: `packages/tsconfig/base.json`
- Create: `packages/tsconfig/service.json`
- Create: `packages/tsconfig/nextjs.json`

**Interfaces:**
- Produces: `@carat-room/tsconfig` — extended by all apps via `"extends": "@carat-room/tsconfig/service"` or `"@carat-room/tsconfig/nextjs"`

- [ ] **Step 1: Create the package**

```bash
mkdir -p packages/tsconfig
```

`packages/tsconfig/package.json`:
```json
{
  "name": "@carat-room/tsconfig",
  "version": "0.0.1",
  "private": true,
  "exports": {
    "./base": "./base.json",
    "./service": "./service.json",
    "./nextjs": "./nextjs.json"
  }
}
```

- [ ] **Step 2: Create `base.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleDetection": "force",
    "isolatedModules": true
  }
}
```

- [ ] **Step 3: Create `service.json`** (for Hono backend services)

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `nextjs.json`** (for Next.js frontends)

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2017",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "lib": ["ES2017", "DOM", "DOM.Iterable"],
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/tsconfig/
git commit -m "chore: add shared TypeScript config package"
```

---

### Task 3: Docker Compose Stack

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.override.yml`
- Create: `infra/postgres/init.sql`
- Create: `infra/rabbitmq/definitions.json`
- Create: `infra/nginx/nginx.conf`

**Interfaces:**
- Produces: `docker compose up postgres redis rabbitmq -d` starts all infrastructure services healthy. App service entries are included as stubs using placeholder images — they will be built out in each domain task.

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p infra/postgres infra/rabbitmq infra/nginx
```

- [ ] **Step 2: Create `infra/postgres/init.sql`**

Creates a separate database for each service on one PostgreSQL instance:

```sql
CREATE DATABASE carat_users;
CREATE DATABASE carat_catalogue;
CREATE DATABASE carat_auction_engine;
CREATE DATABASE carat_payments;
CREATE DATABASE carat_notifications;
CREATE DATABASE carat_shipping;

GRANT ALL PRIVILEGES ON DATABASE carat_users TO postgres;
GRANT ALL PRIVILEGES ON DATABASE carat_catalogue TO postgres;
GRANT ALL PRIVILEGES ON DATABASE carat_auction_engine TO postgres;
GRANT ALL PRIVILEGES ON DATABASE carat_payments TO postgres;
GRANT ALL PRIVILEGES ON DATABASE carat_notifications TO postgres;
GRANT ALL PRIVILEGES ON DATABASE carat_shipping TO postgres;
```

- [ ] **Step 3: Create `infra/rabbitmq/definitions.json`**

Pre-configures all exchanges and queues so services can publish/subscribe on startup:

```json
{
  "vhosts": [{ "name": "/" }],
  "exchanges": [
    {
      "name": "carat.events",
      "vhost": "/",
      "type": "topic",
      "durable": true,
      "auto_delete": false
    }
  ],
  "queues": [
    { "name": "notification.user.registered", "vhost": "/", "durable": true },
    { "name": "notification.phone.verification.requested", "vhost": "/", "durable": true },
    { "name": "notification.bid.placed", "vhost": "/", "durable": true },
    { "name": "notification.auction.closing.soon", "vhost": "/", "durable": true },
    { "name": "notification.auction.closed", "vhost": "/", "durable": true },
    { "name": "notification.invoice.created", "vhost": "/", "durable": true },
    { "name": "notification.payment.received", "vhost": "/", "durable": true },
    { "name": "notification.invoice.expired", "vhost": "/", "durable": true },
    { "name": "notification.item.dispatched", "vhost": "/", "durable": true },
    { "name": "notification.item.collected", "vhost": "/", "durable": true },
    { "name": "payment.auction.closed", "vhost": "/", "durable": true },
    { "name": "shipping.payment.received", "vhost": "/", "durable": true }
  ],
  "bindings": [
    { "source": "carat.events", "vhost": "/", "destination": "notification.user.registered", "destination_type": "queue", "routing_key": "user.registered" },
    { "source": "carat.events", "vhost": "/", "destination": "notification.phone.verification.requested", "destination_type": "queue", "routing_key": "user.phone.verification.requested" },
    { "source": "carat.events", "vhost": "/", "destination": "notification.bid.placed", "destination_type": "queue", "routing_key": "auction.bid.placed" },
    { "source": "carat.events", "vhost": "/", "destination": "notification.auction.closing.soon", "destination_type": "queue", "routing_key": "auction.closing.soon" },
    { "source": "carat.events", "vhost": "/", "destination": "notification.auction.closed", "destination_type": "queue", "routing_key": "auction.closed" },
    { "source": "carat.events", "vhost": "/", "destination": "notification.invoice.created", "destination_type": "queue", "routing_key": "payment.invoice.created" },
    { "source": "carat.events", "vhost": "/", "destination": "notification.payment.received", "destination_type": "queue", "routing_key": "payment.received" },
    { "source": "carat.events", "vhost": "/", "destination": "notification.invoice.expired", "destination_type": "queue", "routing_key": "payment.invoice.expired" },
    { "source": "carat.events", "vhost": "/", "destination": "notification.item.dispatched", "destination_type": "queue", "routing_key": "shipping.item.dispatched" },
    { "source": "carat.events", "vhost": "/", "destination": "notification.item.collected", "destination_type": "queue", "routing_key": "shipping.item.collected" },
    { "source": "carat.events", "vhost": "/", "destination": "payment.auction.closed", "destination_type": "queue", "routing_key": "auction.closed" },
    { "source": "carat.events", "vhost": "/", "destination": "shipping.payment.received", "destination_type": "queue", "routing_key": "payment.received" }
  ]
}
```

- [ ] **Step 4: Create `infra/nginx/nginx.conf`** (HTTP only — HTTPS added in Task 7)

```nginx
events {
  worker_connections 1024;
}

http {
  upstream user_service         { server user-service:3001; }
  upstream catalogue_service    { server catalogue-service:3002; }
  upstream auction_engine       { server auction-engine:3003; }
  upstream payment_service      { server payment-service:3004; }
  upstream notification_service { server notification-service:3005; }
  upstream shipping_service     { server shipping-service:3006; }
  upstream admin_service        { server admin-service:3007; }
  upstream user_portal          { server user-portal:3000; }
  upstream admin_portal         { server admin-portal:3008; }

  server {
    listen 80;
    server_name _;

    proxy_buffering off;

    location /api/users/     { proxy_pass http://user_service;      proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /api/lots/      { proxy_pass http://catalogue_service; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /api/auctions/  {
      proxy_pass http://auction_engine;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header Connection '';
      proxy_http_version 1.1;
      chunked_transfer_encoding on;
    }
    location /api/payments/  { proxy_pass http://payment_service;   proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /api/shipping/  { proxy_pass http://shipping_service;  proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /admin/api/     { proxy_pass http://admin_service;     proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /admin/         { proxy_pass http://admin_portal;      proxy_set_header Host $host; }
    location /               { proxy_pass http://user_portal;       proxy_set_header Host $host; }
  }
}
```

- [ ] **Step 5: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
      RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS: "-rabbitmq_management load_definitions \"/etc/rabbitmq/definitions.json\""
    volumes:
      - ./infra/rabbitmq/definitions.json:/etc/rabbitmq/definitions.json
      - rabbitmq_data:/var/lib/rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  nginx:
    image: nginx:alpine
    volumes:
      - ./infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - user-portal

  user-portal:
    image: ghcr.io/the-carat-room/user-portal:latest
    ports:
      - "3000:3000"

  admin-portal:
    image: ghcr.io/the-carat-room/admin-portal:latest
    ports:
      - "3008:3008"

  user-service:
    image: ghcr.io/the-carat-room/user-service:latest
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/carat_users
      RABBITMQ_URL: amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
      JWT_PRIVATE_KEY: ${JWT_PRIVATE_KEY}
      JWT_PUBLIC_KEY: ${JWT_PUBLIC_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    ports:
      - "3001:3001"

  catalogue-service:
    image: ghcr.io/the-carat-room/catalogue-service:latest
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/carat_catalogue
      RABBITMQ_URL: amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
      R2_ACCOUNT_ID: ${R2_ACCOUNT_ID}
      R2_ACCESS_KEY_ID: ${R2_ACCESS_KEY_ID}
      R2_SECRET_ACCESS_KEY: ${R2_SECRET_ACCESS_KEY}
      R2_BUCKET_NAME: ${R2_BUCKET_NAME}
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    ports:
      - "3002:3002"

  auction-engine:
    image: ghcr.io/the-carat-room/auction-engine:latest
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/carat_auction_engine
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    ports:
      - "3003:3003"

  payment-service:
    image: ghcr.io/the-carat-room/payment-service:latest
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/carat_payments
      RABBITMQ_URL: amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    ports:
      - "3004:3004"

  notification-service:
    image: ghcr.io/the-carat-room/notification-service:latest
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/carat_notifications
      RABBITMQ_URL: amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
      RESEND_API_KEY: ${RESEND_API_KEY}
      TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID}
      TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN}
      TWILIO_PHONE_NUMBER: ${TWILIO_PHONE_NUMBER}
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    ports:
      - "3005:3005"

  shipping-service:
    image: ghcr.io/the-carat-room/shipping-service:latest
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/carat_shipping
      RABBITMQ_URL: amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    ports:
      - "3006:3006"

  admin-service:
    image: ghcr.io/the-carat-room/admin-service:latest
    environment:
      JWT_PUBLIC_KEY: ${JWT_PUBLIC_KEY}
      USER_SERVICE_URL: http://user-service:3001
      CATALOGUE_SERVICE_URL: http://catalogue-service:3002
      AUCTION_ENGINE_URL: http://auction-engine:3003
      PAYMENT_SERVICE_URL: http://payment-service:3004
      SHIPPING_SERVICE_URL: http://shipping-service:3006
    depends_on:
      rabbitmq:
        condition: service_healthy
    ports:
      - "3007:3007"

volumes:
  postgres_data:
  rabbitmq_data:
```

- [ ] **Step 6: Create `docker-compose.override.yml`** (local dev — builds from source instead of pulling images)

```yaml
services:
  user-portal:
    build: { context: ., dockerfile: apps/user-portal/Dockerfile }
    volumes: [./apps/user-portal:/app/apps/user-portal]
    command: pnpm dev

  admin-portal:
    build: { context: ., dockerfile: apps/admin-portal/Dockerfile }
    volumes: [./apps/admin-portal:/app/apps/admin-portal]
    command: pnpm dev

  user-service:
    build: { context: ., dockerfile: apps/user-service/Dockerfile }
    volumes: [./apps/user-service:/app/apps/user-service]
    command: pnpm dev

  catalogue-service:
    build: { context: ., dockerfile: apps/catalogue-service/Dockerfile }
    volumes: [./apps/catalogue-service:/app/apps/catalogue-service]
    command: pnpm dev

  auction-engine:
    build: { context: ., dockerfile: apps/auction-engine/Dockerfile }
    volumes: [./apps/auction-engine:/app/apps/auction-engine]
    command: pnpm dev

  payment-service:
    build: { context: ., dockerfile: apps/payment-service/Dockerfile }
    volumes: [./apps/payment-service:/app/apps/payment-service]
    command: pnpm dev

  notification-service:
    build: { context: ., dockerfile: apps/notification-service/Dockerfile }
    volumes: [./apps/notification-service:/app/apps/notification-service]
    command: pnpm dev

  shipping-service:
    build: { context: ., dockerfile: apps/shipping-service/Dockerfile }
    volumes: [./apps/shipping-service:/app/apps/shipping-service]
    command: pnpm dev

  admin-service:
    build: { context: ., dockerfile: apps/admin-service/Dockerfile }
    volumes: [./apps/admin-service:/app/apps/admin-service]
    command: pnpm dev
```

- [ ] **Step 7: Create `.env.example`**

```bash
# PostgreSQL
POSTGRES_PASSWORD=changeme

# RabbitMQ
RABBITMQ_USER=carat
RABBITMQ_PASSWORD=changeme

# JWT — RS256 key pair
# Generate with:
#   openssl genrsa -out private.pem 2048
#   openssl rsa -in private.pem -pubout -out public.pem
# Then copy file contents here replacing newlines with \n
JWT_PRIVATE_KEY=
JWT_PUBLIC_KEY=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=carat-room-assets

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend (email)
RESEND_API_KEY=re_...

# Twilio (SMS)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=+61...
```

- [ ] **Step 8: Generate local JWT key pair**

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Copy `.pem` contents into `.env` as single-line values — replace each newline with `\n`. Both `.pem` files are already in `.gitignore`.

- [ ] **Step 9: Copy `.env.example` to `.env` and fill in local values**

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD and RABBITMQ_PASSWORD to any local dev values
# Paste JWT keys from Step 8
# Leave Stripe/Resend/Twilio/R2 blank — filled in during domain tasks
```

- [ ] **Step 10: Start infrastructure and verify**

```bash
docker compose up postgres redis rabbitmq -d
```

Verify PostgreSQL databases:
```bash
docker compose exec postgres psql -U postgres -c "\l"
```
Expected: list includes `carat_users`, `carat_catalogue`, `carat_auction_engine`, `carat_payments`, `carat_notifications`, `carat_shipping`.

Verify Redis:
```bash
docker compose exec redis redis-cli ping
```
Expected: `PONG`

Verify RabbitMQ — open `http://localhost:15672` in browser. Log in with `RABBITMQ_USER` / `RABBITMQ_PASSWORD`. Check:
- Exchanges tab: `carat.events` exists, type `topic`, durable
- Queues tab: all 12 queues listed

- [ ] **Step 11: Commit**

```bash
git add docker-compose.yml docker-compose.override.yml infra/ .env.example
git commit -m "chore: add Docker Compose stack — Postgres, Redis, RabbitMQ, Nginx"
```

---

### Task 4: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: CI runs on every PR; deploy SSHes into Hetzner VM on push to `main`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - run: pnpm turbo test
```

- [ ] **Step 2: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Hetzner VM
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: ${{ secrets.HETZNER_USER }}
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            cd /opt/the-carat-room
            git pull origin main
            docker compose pull
            docker compose up -d
            docker image prune -f
```

- [ ] **Step 3: Add GitHub repository secrets**

In GitHub → Settings → Secrets → Actions, add:
- `HETZNER_HOST` — VM IP address
- `HETZNER_USER` — SSH deploy user (e.g. `deploy`)
- `HETZNER_SSH_KEY` — contents of the deploy user's private SSH key

Production secrets for all env vars in `.env.example` will be added per domain task as each service is built.

- [ ] **Step 4: Commit**

```bash
git add .github/
git commit -m "chore: add GitHub Actions CI and deploy workflows"
```

---

### Task 5: Cloudflare R2 Bucket

**Files:**
- Create: `docs/runbooks/r2-setup.md`

**Interfaces:**
- Produces: `carat-room-assets` R2 bucket with CORS, API token credentials ready for `.env`

- [ ] **Step 1: Create the R2 bucket**

1. Cloudflare dashboard → R2 Object Storage → Create bucket
2. Name: `carat-room-assets`
3. Location: Automatic

- [ ] **Step 2: Configure CORS**

In bucket settings → CORS policy:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

- [ ] **Step 3: Create API token**

Cloudflare dashboard → R2 → Manage R2 API tokens → Create API token:
- Permissions: Object Read & Write
- Specify bucket: `carat-room-assets`

Copy `Access Key ID` and `Secret Access Key` into `.env`:
```
R2_ACCOUNT_ID=<Cloudflare account ID from dashboard URL>
R2_ACCESS_KEY_ID=<from token>
R2_SECRET_ACCESS_KEY=<from token>
R2_BUCKET_NAME=carat-room-assets
```

- [ ] **Step 4: Write runbook**

`docs/runbooks/r2-setup.md`:
```markdown
# Cloudflare R2 Setup Runbook

Bucket: `carat-room-assets`
Region: Automatic (Cloudflare-managed)

## Access
API token scoped to `carat-room-assets` — Object Read & Write only.
Credentials in `.env` as `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.

## CORS
Configured to allow GET and PUT from the user portal origin.
PUT is used for pre-signed direct browser uploads from the admin portal.

## Upload flow
1. Admin requests a pre-signed PUT URL from Catalogue Service
2. Browser uploads the image directly to R2 — no binary data passes through any service
3. Catalogue Service stores the returned R2 URL

## Updating allowed origins
Edit the CORS policy in the Cloudflare R2 dashboard when adding new domains.
```

- [ ] **Step 5: Commit**

```bash
git add docs/runbooks/r2-setup.md
git commit -m "docs: add Cloudflare R2 setup runbook"
```

---

### Task 6: Hetzner VM Provisioning

**Files:**
- Create: `docs/runbooks/vm-setup.md`

**Interfaces:**
- Produces: live Hetzner VM with Docker, deploy user, and repo checked out at `/opt/the-carat-room`

- [ ] **Step 1: Create Hetzner CX32 server**

1. Hetzner Cloud Console → New Server
2. Location: pick nearest to your users (e.g. Singapore for AU/Asia)
3. Image: Ubuntu 24.04
4. Type: CX32 (4 vCPU, 8 GB RAM)
5. SSH key: add your public key
6. Name: `carat-room-prod`

- [ ] **Step 2: Install Docker**

```bash
ssh root@<VM_IP>
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
systemctl enable docker
```

- [ ] **Step 3: Create deploy user**

```bash
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
```

- [ ] **Step 4: Clone repo and create `.env`**

```bash
su - deploy
git clone https://github.com/your-org/the-carat-room.git /opt/the-carat-room
cd /opt/the-carat-room
cp .env.example .env
nano .env   # fill in production secrets
```

- [ ] **Step 5: Start infrastructure services**

```bash
docker compose up postgres redis rabbitmq -d
docker compose ps
```
Expected: all three show `healthy`.

- [ ] **Step 6: Write runbook**

`docs/runbooks/vm-setup.md`:
```markdown
# Hetzner VM Setup Runbook

Server: CX32 (4 vCPU, 8 GB RAM) — Ubuntu 24.04
Deploy user: `deploy`
Repo path: `/opt/the-carat-room`

## Manual deploy
```bash
cd /opt/the-carat-room
git pull origin main
docker compose pull
docker compose up -d
```

## View logs
```bash
docker compose logs -f <service-name>
```

## Restart a single service
```bash
docker compose restart <service-name>
```

## First-time setup
See Task 6 in `docs/superpowers/plans/00-infrastructure/plan.md`.
```

- [ ] **Step 7: Commit**

```bash
git add docs/runbooks/vm-setup.md
git commit -m "docs: add Hetzner VM provisioning runbook"
```

---

### Task 7: HTTPS with Let's Encrypt

**Files:**
- Modify: `infra/nginx/nginx.conf`
- Modify: `docker-compose.yml` (add cert volume mount to nginx service)
- Create: `docs/runbooks/ssl-setup.md`

**Interfaces:**
- Produces: HTTPS on port 443, HTTP → HTTPS redirect, auto-renewing certificate, admin routes IP-restricted

- [ ] **Step 1: Point DNS to the VM**

Add A records in your DNS provider:
- `yourdomain.com` → `<VM_IP>`
- `www.yourdomain.com` → `<VM_IP>`

Wait for propagation:
```bash
dig yourdomain.com
```
Expected: returns `<VM_IP>`.

- [ ] **Step 2: Install Certbot on the VM**

```bash
ssh deploy@<VM_IP>
sudo apt install certbot -y
```

- [ ] **Step 3: Stop Nginx and obtain certificate**

```bash
docker compose stop nginx
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
docker compose start nginx
```

Certificate files saved to `/etc/letsencrypt/live/yourdomain.com/`.

- [ ] **Step 4: Replace `infra/nginx/nginx.conf` with HTTPS version**

```nginx
events {
  worker_connections 1024;
}

http {
  upstream user_service         { server user-service:3001; }
  upstream catalogue_service    { server catalogue-service:3002; }
  upstream auction_engine       { server auction-engine:3003; }
  upstream payment_service      { server payment-service:3004; }
  upstream notification_service { server notification-service:3005; }
  upstream shipping_service     { server shipping-service:3006; }
  upstream admin_service        { server admin-service:3007; }
  upstream user_portal          { server user-portal:3000; }
  upstream admin_portal         { server admin-portal:3008; }

  server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    proxy_buffering off;

    location /api/users/     { proxy_pass http://user_service;      proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /api/lots/      { proxy_pass http://catalogue_service; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /api/auctions/  {
      proxy_pass http://auction_engine;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header Connection '';
      proxy_http_version 1.1;
      chunked_transfer_encoding on;
    }
    location /api/payments/  { proxy_pass http://payment_service;  proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /api/shipping/  { proxy_pass http://shipping_service; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
    location /admin/api/ {
      # Replace with your office/VPN IP range
      allow 10.0.0.0/8;
      deny all;
      proxy_pass http://admin_service;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }
    location /admin/ {
      allow 10.0.0.0/8;
      deny all;
      proxy_pass http://admin_portal;
      proxy_set_header Host $host;
    }
    location / { proxy_pass http://user_portal; proxy_set_header Host $host; }
  }
}
```

- [ ] **Step 5: Mount certificate into Nginx in `docker-compose.yml`**

Update the `nginx` service volumes:

```yaml
  nginx:
    image: nginx:alpine
    volumes:
      - ./infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    ports:
      - "80:80"
      - "443:443"
```

- [ ] **Step 6: Set up certificate auto-renewal on the VM**

```bash
sudo crontab -e
```
Add:
```
0 3 * * * certbot renew --quiet && docker compose -f /opt/the-carat-room/docker-compose.yml restart nginx
```

- [ ] **Step 7: Reload Nginx and verify**

```bash
docker compose restart nginx
curl -I https://yourdomain.com
```
Expected: `HTTP/2 200` (or `502` until app services are deployed — correct at this stage).

- [ ] **Step 8: Write runbook**

`docs/runbooks/ssl-setup.md`:
```markdown
# SSL Setup Runbook

Certificate provider: Let's Encrypt (Certbot)
Domains: yourdomain.com, www.yourdomain.com
Auto-renewal: cron at 3am daily

## Manual renewal
```bash
sudo certbot renew
docker compose restart nginx
```

## Adding a new subdomain
Re-run certbot with the additional `-d` flag:
```bash
docker compose stop nginx
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com -d newsubdomain.yourdomain.com
docker compose start nginx
```
```

- [ ] **Step 9: Commit**

```bash
git add infra/nginx/nginx.conf docker-compose.yml docs/runbooks/ssl-setup.md
git commit -m "chore: configure HTTPS with Let's Encrypt and Nginx IP restrictions for admin"
```

---

## Acceptance Criteria

- [ ] `pnpm install && pnpm turbo build` succeeds from repo root
- [ ] `docker compose up postgres redis rabbitmq -d` — all three services reach `healthy` state
- [ ] PostgreSQL contains all 6 databases: `carat_users`, `carat_catalogue`, `carat_auction_engine`, `carat_payments`, `carat_notifications`, `carat_shipping`
- [ ] RabbitMQ management UI shows `carat.events` exchange (topic, durable) and all 12 queues with correct routing key bindings
- [ ] Redis responds to `ping` with `PONG`
- [ ] Nginx routes `/api/users/`, `/api/lots/`, `/api/auctions/`, `/api/payments/`, `/api/shipping/` to correct upstream ports
- [ ] `/admin/` and `/admin/api/` return 403 from non-allowlisted IPs
- [ ] GitHub Actions CI workflow triggers on PRs to `main`
- [ ] GitHub Actions deploy workflow triggers on push to `main` and SSHes into VM
- [ ] Cloudflare R2 bucket `carat-room-assets` exists with CORS configured for user portal origin
- [ ] HTTPS certificate issued for `yourdomain.com`, HTTP redirects to HTTPS
- [ ] Certificate auto-renewal cron configured on VM
