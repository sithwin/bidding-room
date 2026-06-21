import { describe, it, expect } from 'vitest';
import { createLogger } from './logger.js';
import { runWithContext, getContext, getLogger } from './context.js';
import type { RequestContext } from './context.js';

function buildContext(overrides?: Partial<RequestContext>): RequestContext {
  const logger = createLogger({ service: 'test' });
  return {
    requestId: 'req-123',
    correlationId: 'corr-456',
    logger,
    ...overrides,
  };
}

describe('runWithContext / getContext / getLogger', () => {
  it('should_returnContext_when_insideRunWithContext', () => {
    const ctx = buildContext();

    const result = runWithContext(ctx, () => getContext());

    expect(result).toBe(ctx);
  });

  it('should_returnLogger_when_insideRunWithContext', () => {
    const ctx = buildContext();

    const result = runWithContext(ctx, () => getLogger());

    expect(result).toBe(ctx.logger);
  });

  it('should_throwError_when_getLoggerCalledOutsideContext', () => {
    expect(() => getLogger()).toThrow(
      'getLogger() called outside a request context. Use runWithContext() or requestContextMiddleware first.',
    );
  });

  it('should_isolateContexts_when_runWithContextIsNested', () => {
    const outerCtx = buildContext({ requestId: 'outer-req' });
    const innerCtx = buildContext({ requestId: 'inner-req' });

    const outerSeen: string[] = [];
    const innerSeen: string[] = [];

    runWithContext(outerCtx, () => {
      outerSeen.push(getContext()?.requestId ?? '');

      runWithContext(innerCtx, () => {
        innerSeen.push(getContext()?.requestId ?? '');
      });

      outerSeen.push(getContext()?.requestId ?? '');
    });

    expect(outerSeen).toEqual(['outer-req', 'outer-req']);
    expect(innerSeen).toEqual(['inner-req']);
  });

  it('should_preserveContext_when_awaitIsUsed', async () => {
    const ctx = buildContext();

    const result = await runWithContext(ctx, async () => {
      await Promise.resolve();
      return getContext();
    });

    expect(result).toBe(ctx);
  });
});
