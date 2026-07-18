import { type Context, type MiddlewareHandler } from 'hono';
import { type Metrics } from './metrics';

export function httpMetricsMiddleware(metrics: Metrics): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = process.hrtime.bigint();

    await next();

    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const route = c.req.routePath === '/*' ? 'unmatched' : c.req.routePath;
    const labels = { method: c.req.method, route, status: String(c.res.status) };

    metrics.httpRequestDuration.observe(labels, durationSeconds);
    metrics.httpRequestsTotal.inc(labels);
  };
}

export function metricsRoute(metrics: Metrics): (c: Context) => Promise<Response> {
  return async (c) => {
    const body = await metrics.registry.metrics();
    return c.text(body, 200, { 'Content-Type': metrics.registry.contentType });
  };
}
