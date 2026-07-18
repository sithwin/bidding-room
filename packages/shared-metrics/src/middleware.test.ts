import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createMetrics } from './metrics';
import { httpMetricsMiddleware, metricsRoute } from './middleware';

describe('httpMetricsMiddleware', () => {
  it('should_recordRequestDurationAndCount_when_requestCompletes', async () => {
    const metrics = createMetrics({ service: 'test-service' });
    const app = new Hono();
    app.use('*', httpMetricsMiddleware(metrics));
    app.get('/health', (c) => c.json({ status: 'ok' }));
    app.get('/metrics', metricsRoute(metrics));

    await app.request('/health');
    const metricsResponse = await app.request('/metrics');
    const body = await metricsResponse.text();

    expect(body).toContain('http_requests_total{service="test-service",method="GET",route="/health",status="200"} 1');
  });

  it('should_labelRouteAsUnmatched_when_noRouteMatches', async () => {
    const metrics = createMetrics({ service: 'test-service' });
    const app = new Hono();
    app.use('*', httpMetricsMiddleware(metrics));
    app.get('/metrics', metricsRoute(metrics));

    await app.request('/does-not-exist');
    const metricsResponse = await app.request('/metrics');
    const body = await metricsResponse.text();

    expect(body).toContain('route="unmatched"');
  });
});

describe('metricsRoute', () => {
  it('should_returnPrometheusContentType_when_called', async () => {
    const metrics = createMetrics({ service: 'test-service' });
    const app = new Hono();
    app.get('/metrics', metricsRoute(metrics));

    const response = await app.request('/metrics');

    expect(response.headers.get('content-type')).toContain('text/plain');
  });
});
