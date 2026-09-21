import assert from 'node:assert/strict';

import { trace } from '@opentelemetry/api';
import { afterEach, test, vi } from 'vitest';

import { fastifyLoggerOptions, registerHttpMetrics } from './fastify';
import { registry } from './metrics.registry';

const inSpan = (traceFlags: number) =>
  vi.spyOn(trace, 'getActiveSpan').mockReturnValue({
    spanContext: () => ({ traceId: 'e'.repeat(32), spanId: 'f'.repeat(16), traceFlags }),
  } as never);

afterEach(() => {
  vi.restoreAllMocks();
});

test('Fastify log lines inside a sampled span carry its trace', () => {
  inSpan(1);

  assert.deepEqual(fastifyLoggerOptions.mixin(), {
    traceId: 'e'.repeat(32),
    spanId: 'f'.repeat(16),
  });
});

test('Fastify log lines inside a span that was not sampled name no trace', () => {
  inSpan(0);

  assert.deepEqual(fastifyLoggerOptions.mixin(), {});
});

test('Fastify log lines outside any span name no trace', () => {
  assert.deepEqual(fastifyLoggerOptions.mixin(), {});
});

type Hook = (request: unknown, reply: unknown) => Promise<unknown>;

const stubApp = () => {
  const hooks: Record<string, Hook> = {};
  const routes: Record<string, Hook> = {};
  const app = {
    addHook: (name: string, hook: Hook) => {
      hooks[name] = hook;
    },
    get: (path: string, _options: unknown, handler: Hook) => {
      routes[path] = handler;
    },
  };
  registerHttpMetrics(app as never);
  return { hooks, routes };
};

const requests = async (route: string, status: string) => {
  const metric = await registry.getSingleMetric('http_requests_total')?.get();
  return (
    metric?.values.find((value) => value.labels.route === route && value.labels.status === status)
      ?.value ?? 0
  );
};

test('a request is counted by its route pattern, never the path it was called with', async () => {
  const { hooks } = stubApp();

  await hooks.onResponse(
    { method: 'GET', url: '/v1/pairs/42?secret=1', routeOptions: { url: '/v1/pairs/:id' } },
    { statusCode: 200, elapsedTime: 12 }
  );
  await hooks.onResponse(
    { method: 'GET', url: '/unmatched?secret=1' },
    { statusCode: 404, elapsedTime: 1 }
  );
  await hooks.onResponse({ method: 'GET', url: '?secret=1' }, { statusCode: 400, elapsedTime: 1 });

  assert.equal(await requests('/v1/pairs/:id', '200'), 1);
  assert.equal(await requests('/unmatched', '404'), 1);
  assert.equal(await requests('', '400'), 0);
});

test('the metrics route serves the registry in the format Prometheus scrapes', async () => {
  const { routes } = stubApp();
  const headers: Record<string, string> = {};

  const body = await routes['/metrics'](
    {},
    {
      header: (name: string, value: string) => {
        headers[name] = value;
      },
    }
  );

  assert.match(headers['Content-Type'] ?? '', /^text\/plain; version=0\.0\.4/);
  assert.match(String(body), /http_request_duration_seconds/);
});
