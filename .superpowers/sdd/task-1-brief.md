### Task 1: Shared Logger Package

**Files:**
- Create: `packages/shared-logger/package.json`
- Create: `packages/shared-logger/tsconfig.json`
- Create: `packages/shared-logger/src/logger.ts`
- Create: `packages/shared-logger/src/context.ts`
- Create: `packages/shared-logger/src/middleware.ts`
- Create: `packages/shared-logger/src/index.ts`
- Create: `packages/shared-logger/src/log.ts`
- Create: `packages/shared-logger/src/logger.test.ts`
- Create: `packages/shared-logger/src/context.test.ts`
- Create: `packages/shared-logger/src/middleware.test.ts`
- Create: `packages/shared-logger/src/log.test.ts`

**Interfaces:**
- Consumes: `@carat-room/tsconfig/service`
- Produces:
  - `createLogger(config: LoggerConfig): Logger` — creates a pino logger instance
  - `getLogger(): Logger` — returns logger bound to current AsyncLocalStorage context; throws if no context active
  - `getContext(): RequestContext | undefined` — returns full context or undefined if outside a request
  - `runWithContext(ctx: RequestContext, fn: () => T): T` — runs `fn` inside an AsyncLocalStorage context
  - `requestContextMiddleware(rootLogger: Logger): MiddlewareHandler` — Hono middleware that reads `X-Correlation-ID` header (or generates one), generates a `requestId` (UUID v4), creates a child logger, stores `{ requestId, correlationId, logger }` in AsyncLocalStorage for the life of the request
  - `RequestContext` type — `{ requestId: string; correlationId: string; logger: Logger }`
  - `LoggerConfig` type — `{ service: string; level?: LogLevel; pretty?: boolean }`
  - `LogLevel` type — `'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'`
  - `LogEntry` type — `{ logEvent: string; payload?: Record<string, unknown> }`
  - `log(level: LogLevel, entry: LogEntry, description: string): void` — typed helper that calls `getLogger()[level]({ logEvent: entry.logEvent, payload: entry.payload ?? {} }, description)`. This is the **preferred** call site for all services — enforces the three-field shape at compile time.

---

- [ ] **Step 1: Create `packages/shared-logger/package.json`**

```json
{
  "name": "@carat-room/shared-logger",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run"
  },
  "dependencies": {
    "hono": "^4.4.0",
    "pino": "^9.0.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@carat-room/tsconfig": "workspace:*",
    "@types/node": "^20.0.0",
    "@types/uuid": "^10.0.0",
    "pino-pretty": "^11.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/shared-logger/tsconfig.json`**

```json
{
  "extends": "@carat-room/tsconfig/service",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "dist"]
}
```

- [ ] **Step 3: Create `packages/shared-logger/src/logger.ts`**

```typescript
import pino, { type Logger } from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerConfig {
  service: string;
  level?: LogLevel;
  pretty?: boolean;
}

export function createLogger(config: LoggerConfig): Logger {
  const { service, level = 'info', pretty = false } = config;

  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: pretty
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  });
}
```

- [ ] **Step 4: Create `packages/shared-logger/src/context.ts`**

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { type Logger } from 'pino';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  logger: Logger;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getLogger(): Logger {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      'getLogger() called outside a request context. Use runWithContext() or requestContextMiddleware first.',
    );
  }
  return ctx.logger;
}
```

- [ ] **Step 5: Create `packages/shared-logger/src/middleware.ts`**

```typescript
import { type MiddlewareHandler } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { type Logger } from 'pino';
import { runWithContext } from './context.js';

export function requestContextMiddleware(rootLogger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const correlationId = c.req.header('x-correlation-id') ?? uuidv4();
    const requestId = uuidv4();

    const logger = rootLogger.child({ requestId, correlationId });

    logger.info({ method: c.req.method, path: c.req.path }, 'request received');

    await runWithContext({ requestId, correlationId, logger }, () => next());

    logger.info({ status: c.res.status }, 'request completed');
  };
}
```

- [ ] **Step 6: Create `packages/shared-logger/src/log.ts`**

```typescript
import { type LogLevel } from './logger.js';
import { getLogger } from './context.js';

export interface LogEntry {
  logEvent: string;
  payload?: Record<string, unknown>;
}

export function log(level: LogLevel, entry: LogEntry, description: string): void {
  getLogger()[level](
    { logEvent: entry.logEvent, payload: entry.payload ?? {} },
    description,
  );
}
```

- [ ] **Step 7: Create `packages/shared-logger/src/index.ts`**

```typescript
export { createLogger } from './logger.js';
export type { LoggerConfig, LogLevel } from './logger.js';

export { runWithContext, getContext, getLogger } from './context.js';
export type { RequestContext } from './context.js';

export { requestContextMiddleware } from './middleware.js';

export { log } from './log.js';
export type { LogEntry } from './log.js';
```

- [ ] **Step 8: Create `packages/shared-logger/src/logger.test.ts`**

Test the `createLogger` factory:

- `should_createLogger_when_configIsValid` — calls `createLogger({ service: 'test' })`, asserts returned object has `.info`, `.warn`, `.error` methods
- `should_respectLogLevel_when_levelIsProvided` — creates logger with `level: 'warn'`, asserts `logger.level === 'warn'`
- `should_includeServiceInBase_when_serviceIsProvided` — creates logger with `service: 'catalogue'`, asserts `logger.bindings().service === 'catalogue'`

- [ ] **Step 9: Create `packages/shared-logger/src/context.test.ts`**

Test `runWithContext`, `getContext`, `getLogger`:

- `should_returnContext_when_insideRunWithContext` — calls `runWithContext(ctx, () => getContext())`, asserts returned context matches the one passed in
- `should_returnLogger_when_insideRunWithContext` — calls `runWithContext(ctx, () => getLogger())`, asserts it is the logger from ctx
- `should_throwError_when_getLoggerCalledOutsideContext` — calls `getLogger()` outside any context, asserts it throws with the expected message
- `should_isolateContexts_when_runWithContextIsNested` — runs two nested `runWithContext` calls with different `requestId` values, asserts each `getContext()` returns its own context

- [ ] **Step 10: Create `packages/shared-logger/src/middleware.test.ts`**

Test `requestContextMiddleware` using Hono's test utilities:

- `should_generateRequestIdAndCorrelationId_when_noHeaderProvided` — sends a request with no `x-correlation-id` header; inside the handler calls `getContext()`, asserts `requestId` and `correlationId` are non-empty strings
- `should_useProvidedCorrelationId_when_headerIsPresent` — sends a request with `x-correlation-id: test-corr-id`; inside the handler calls `getContext()`, asserts `correlationId === 'test-corr-id'`
- `should_bindLoggerToContext_when_requestIsProcessed` — asserts `getLogger()` inside the handler returns a logger whose bindings include `requestId` and `correlationId`

- [ ] **Step 11: Create `packages/shared-logger/src/log.test.ts`**

Test the `log()` helper inside a `runWithContext` block:

- `should_callLoggerWithCorrectShape_when_logEventAndPayloadProvided` — runs inside `runWithContext`, calls `log('info', { logEvent: 'TEST_EVENT', payload: { id: '1' } }, 'test message')`, asserts the spy was called with `{ logEvent: 'TEST_EVENT', payload: { id: '1' } }` and `'test message'`
- `should_defaultPayloadToEmptyObject_when_payloadIsOmitted` — calls `log('warn', { logEvent: 'NO_PAYLOAD' }, 'no payload')`, asserts spy called with `payload: {}`
- `should_throwError_when_calledOutsideRequestContext` — calls `log(...)` outside `runWithContext`, asserts it throws

- [ ] **Step 12: Run build and tests, confirm clean**

```bash
# From packages/shared-logger
pnpm build
pnpm test

# From repo root — confirms Turborepo pipeline is intact
pnpm turbo build --filter=@carat-room/shared-logger
pnpm turbo test --filter=@carat-room/shared-logger
```

- [ ] **Step 13: Commit**

```
feat(shared-logger): add shared pino logger with AsyncLocalStorage request context
```
