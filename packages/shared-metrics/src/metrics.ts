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

  const rawHistogram = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['service', 'method', 'route', 'status'],
    registers: [registry],
  });

  const rawCounter = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['service', 'method', 'route', 'status'],
    registers: [registry],
  });

  // Wrap to auto-inject service label while keeping the external interface simple
  const httpRequestDuration = {
    observe(labels: { method: string; route: string; status: string }, value: number) {
      return rawHistogram.observe({ service: config.service, ...labels }, value);
    },
  } as unknown as Histogram<'method' | 'route' | 'status'>;

  const httpRequestsTotal = {
    inc(labels: { method: string; route: string; status: string }, value?: number) {
      return rawCounter.inc({ service: config.service, ...labels }, value);
    },
  } as unknown as Counter<'method' | 'route' | 'status'>;

  return { registry, httpRequestDuration, httpRequestsTotal };
}
