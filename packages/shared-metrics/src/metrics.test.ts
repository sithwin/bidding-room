import { describe, it, expect } from 'vitest';
import { createMetrics } from './metrics';

describe('createMetrics', () => {
  it('should_setServiceAsDefaultLabel_when_created', async () => {
    const metrics = createMetrics({ service: 'test-service' });

    const output = await metrics.registry.metrics();

    expect(output).toContain('service="test-service"');
  });

  it('should_registerHttpRequestMetrics_when_created', async () => {
    const metrics = createMetrics({ service: 'test-service' });

    metrics.httpRequestDuration.observe({ method: 'GET', route: '/health', status: '200' }, 0.05);
    metrics.httpRequestsTotal.inc({ method: 'GET', route: '/health', status: '200' });
    const output = await metrics.registry.metrics();

    expect(output).toContain('http_request_duration_seconds');
    expect(output).toContain('http_requests_total');
  });
});
