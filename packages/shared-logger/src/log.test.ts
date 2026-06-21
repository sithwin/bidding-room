import { describe, it, expect, vi } from 'vitest';
import { createLogger } from './logger.js';
import { runWithContext } from './context.js';
import { log } from './log.js';
import type { RequestContext } from './context.js';

function buildContext(): RequestContext {
  const logger = createLogger({ service: 'test' });
  return {
    requestId: 'req-123',
    correlationId: 'corr-456',
    logger,
  };
}

describe('log', () => {
  it('should_callLoggerWithCorrectShape_when_logEventAndPayloadProvided', () => {
    const ctx = buildContext();
    const spy = vi.spyOn(ctx.logger, 'info');

    runWithContext(ctx, () => {
      log('info', { logEvent: 'TEST_EVENT', payload: { id: '1' } }, 'test message');
    });

    expect(spy).toHaveBeenCalledWith(
      { logEvent: 'TEST_EVENT', payload: { id: '1' } },
      'test message',
    );
  });

  it('should_defaultPayloadToEmptyObject_when_payloadIsOmitted', () => {
    const ctx = buildContext();
    const spy = vi.spyOn(ctx.logger, 'warn');

    runWithContext(ctx, () => {
      log('warn', { logEvent: 'NO_PAYLOAD' }, 'no payload');
    });

    expect(spy).toHaveBeenCalledWith(
      { logEvent: 'NO_PAYLOAD', payload: {} },
      'no payload',
    );
  });

  it('should_throwError_when_calledOutsideRequestContext', () => {
    expect(() => {
      log('info', { logEvent: 'OUTSIDE' }, 'outside context');
    }).toThrow(
      'getLogger() called outside a request context. Use runWithContext() or requestContextMiddleware first.',
    );
  });
});
