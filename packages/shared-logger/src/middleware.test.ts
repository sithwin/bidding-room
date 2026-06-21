import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { createLogger } from './logger.js';
import { requestContextMiddleware } from './middleware.js';
import { getContext, getLogger } from './context.js';

describe('requestContextMiddleware', () => {
  it('should_generateRequestIdAndCorrelationId_when_noHeaderProvided', async () => {
    const rootLogger = createLogger({ service: 'test' });
    const app = new Hono();

    app.use('*', requestContextMiddleware(rootLogger));

    let requestId: string | undefined;
    let correlationId: string | undefined;

    app.get('/test', (c) => {
      const ctx = getContext();
      requestId = ctx?.requestId;
      correlationId = ctx?.correlationId;
      return c.text('ok');
    });

    await app.request('/test');

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(requestId).toMatch(uuidRegex);
    expect(correlationId).toMatch(uuidRegex);
  });

  it('should_useProvidedCorrelationId_when_headerIsPresent', async () => {
    const rootLogger = createLogger({ service: 'test' });
    const app = new Hono();

    app.use('*', requestContextMiddleware(rootLogger));

    let correlationId: string | undefined;

    app.get('/test', (c) => {
      const ctx = getContext();
      correlationId = ctx?.correlationId;
      return c.text('ok');
    });

    await app.request('/test', {
      headers: { 'x-correlation-id': 'test-corr-id' },
    });

    expect(correlationId).toBe('test-corr-id');
  });

  it('should_bindLoggerToContext_when_requestIsProcessed', async () => {
    const rootLogger = createLogger({ service: 'test' });
    const app = new Hono();

    app.use('*', requestContextMiddleware(rootLogger));

    let bindings: Record<string, unknown> | undefined;

    app.get('/test', (c) => {
      const logger = getLogger();
      bindings = logger.bindings();
      return c.text('ok');
    });

    await app.request('/test');

    expect(bindings).toBeDefined();
    expect(typeof bindings!['requestId']).toBe('string');
    expect(typeof bindings!['correlationId']).toBe('string');
  });

  it('should_completeRequest_when_handlerThrows', async () => {
    const rootLogger = createLogger({ service: 'test' });
    const completionCalls: unknown[] = [];

    const originalChild = rootLogger.child.bind(rootLogger);
    vi.spyOn(rootLogger, 'child').mockImplementation((...args) => {
      const child = originalChild(...args);
      const originalInfo = child.info.bind(child);
      vi.spyOn(child, 'info').mockImplementation((...infoArgs) => {
        const [obj] = infoArgs as [unknown, ...unknown[]];
        if (
          typeof obj === 'object' &&
          obj !== null &&
          'logEvent' in obj &&
          (obj as Record<string, unknown>)['logEvent'] === 'REQUEST_COMPLETED'
        ) {
          completionCalls.push(obj);
        }
        return originalInfo(...(infoArgs as Parameters<typeof originalInfo>));
      });
      return child;
    });

    const errorApp = new Hono();
    errorApp.use(requestContextMiddleware(rootLogger));
    errorApp.get('/error', () => {
      throw new Error('handler error');
    });

    await errorApp.request('/error').catch(() => {});

    expect(completionCalls.length).toBeGreaterThan(0);
  });
});
