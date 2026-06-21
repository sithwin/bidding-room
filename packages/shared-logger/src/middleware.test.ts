import { describe, it, expect } from 'vitest';
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

    expect(typeof requestId).toBe('string');
    expect(requestId!.length).toBeGreaterThan(0);
    expect(typeof correlationId).toBe('string');
    expect(correlationId!.length).toBeGreaterThan(0);
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
});
