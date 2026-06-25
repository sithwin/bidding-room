### Task 1: Scaffold — package.json, tsconfig, next.config, tailwind, postcss, vitest

**Files:** Create all config files.

- [x] **Step 1: Create `apps/user-portal/package.json`**

```json
{
  "name": "@carat-room/user-portal",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@radix-ui/react-dialog": "^1.1.17",
    "@radix-ui/react-label": "^2.1.10",
    "@radix-ui/react-select": "^2.3.1",
    "@radix-ui/react-separator": "^1.1.10",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.15",
    "@radix-ui/react-toast": "^1.2.17",
    "@stripe/react-stripe-js": "^2.7.3",
    "@stripe/stripe-js": "^4.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.395.0",
    "next": "14.2.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.80.0",
    "swr": "^2.2.5",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "jsdom": "^24.1.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [x] **Step 2: Create `apps/user-portal/tsconfig.json`**

```json
{
  "extends": "@carat-room/tsconfig/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [x] **Step 3: Create `apps/user-portal/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    USER_SERVICE_URL:      process.env.USER_SERVICE_URL      ?? 'http://localhost:3001',
    CATALOGUE_SERVICE_URL: process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002',
    AUCTION_SERVICE_URL:   process.env.AUCTION_SERVICE_URL   ?? 'http://localhost:3003',
    PAYMENT_SERVICE_URL:   process.env.PAYMENT_SERVICE_URL   ?? 'http://localhost:3004',
    SHIPPING_SERVICE_URL:  process.env.SHIPPING_SERVICE_URL  ?? 'http://localhost:3006',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  },
  images: { domains: ['pub-placeholder.r2.dev'] },
};

export default nextConfig;
```

- [x] **Step 4: Create `apps/user-portal/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper:  '#FFFFFF',
        cream:  '#F5F5F4',
        ink:    '#111111',
        gold:   '#8a8a8a',
        mut:    '#777777',
        canvas: '#e7e5df',
      },
      fontFamily: {
        serif: ['var(--font-bodoni)', 'Georgia', 'serif'],
        sans:  ['var(--font-mulish)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

- [x] **Step 5: Create `apps/user-portal/postcss.config.js`**

```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [x] **Step 6: Create `apps/user-portal/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], globals: true },
  resolve: { alias: { '@': resolve(__dirname, './src') } },
});
```

- [x] **Step 7: Create `apps/user-portal/src/test-setup.ts`**

```typescript
import '@testing-library/jest-dom';
```

- [x] **Step 8: Install and commit**

```bash
pnpm install
git add apps/user-portal/package.json apps/user-portal/tsconfig.json apps/user-portal/next.config.mjs apps/user-portal/tailwind.config.ts apps/user-portal/postcss.config.js apps/user-portal/vitest.config.ts apps/user-portal/src/test-setup.ts
git commit -m "feat(user-portal): scaffold config files"
```

---

