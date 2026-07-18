import { Registry, Histogram, Counter, collectDefaultMetrics } from 'prom-client';

export interface MetricsConfig {
  service: string;
}

export interface Metrics {
  registry: Registry;
  httpRequestDuration: Histogram<'method' | 'route' | 'status'>;
  httpRequestsTotal: Counter<'method' | 'route' | 'status'>;
}

export function createMetrics(config: MetricsConfig): Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service: config.service });
  collectDefaultMetrics({ register: registry });

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });

  const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });

  return { registry, httpRequestDuration, httpRequestsTotal };
}
