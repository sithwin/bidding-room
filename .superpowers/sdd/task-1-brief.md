### Task 1: Package scaffold and DB migration

**Files:**
- Create: `apps/user-auth/package.json`
- Create: `apps/user-auth/tsconfig.json`
- Create: `apps/user-auth/vitest.config.ts`
- Create: `apps/user-auth/migrations/001_create_users.sql`

**Interfaces:**
- Produces: runnable `vitest` and `tsc --noEmit` commands with zero errors

- [x] **Step 1: Create `apps/user-auth/package.json`**

```json
{
  "name": "@carat-room/user-auth",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc --build",
    "start": "node dist/main.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@carat-room/shared-auth": "workspace:*",
    "@carat-room/shared-events": "workspace:*",
    "@carat-room/shared-types": "workspace:*",
    "hono": "^4.4.0",
    "postgres": "^3.4.4",
    "@hono/node-server": "^1.12.0",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@types/bcrypt": "^5.0.2",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [x] **Step 2: Create `apps/user-auth/tsconfig.json`**

```json
{
  "extends": "@carat-room/tsconfig/service.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [x] **Step 3: Create `apps/user-auth/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [x] **Step 4: Create `apps/user-auth/migrations/001_create_users.sql`**

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  phone           TEXT,
  status          TEXT NOT NULL DEFAULT 'REGISTERED',
  -- REGISTERED | EMAIL_VERIFIED | APPROVED_BIDDER | SUSPENDED
  role            TEXT NOT NULL DEFAULT 'BUYER',
  -- BUYER | ADMIN
  country         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE verification_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,  -- EMAIL | PHONE
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_users_email               ON users(email);
CREATE INDEX idx_verification_tokens_user  ON verification_tokens(user_id);
CREATE INDEX idx_refresh_tokens_user       ON refresh_tokens(user_id);
```

- [x] **Step 5: Verify TypeScript compiles**

```bash
cd apps/user-auth && npx tsc --noEmit
```

Expected: no errors (config-only validation, no source files yet)

- [x] **Step 6: Commit**

```bash
git add apps/user-auth/
git commit -m "feat(user-auth): scaffold package and DB migration"
```

---

