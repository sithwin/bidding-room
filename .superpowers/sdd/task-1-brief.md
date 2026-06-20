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

