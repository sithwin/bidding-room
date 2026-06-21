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
