import assert from 'node:assert/strict';

import { afterEach, test, vi } from 'vitest';

import {
  createMetricsRoute,
  createRumIngestRoute,
  registerRumVocabulary,
  registry,
} from './next';

const POST = createRumIngestRoute({ pages: ['/'] });

let nextAddress = 1;

const beacon = {
  events: [{ type: 'navigation', name: 'Page View', page: '/', navigationDepth: 1 }],
};

const post = (headers: Record<string, string>) =>
  POST(
    new Request('http://0.0.0.0:3001/rum/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `203.0.113.${nextAddress++}`,
        ...headers,
      },
      body: JSON.stringify(beacon),
    })
  );

const pageViews = async () => {
  const metric = await registry.getSingleMetric('rum_navigations_total')?.get();
  return metric?.values.find((value) => value.labels.navigation_type === 'Page View')?.value ?? 0;
};

test('the home page series are exported at zero before any beacon arrives', async () => {
  const frustrations = await registry.getSingleMetricAsString('rum_frustrations_total');

  assert.match(
    frustrations,
    /rum_frustrations_total\{frustration_type="dead_click",page="\/",release="unknown"\} 0/
  );
  assert.match(
    frustrations,
    /rum_frustrations_total\{frustration_type="rage_click",page="\/",release="unknown"\} 0/
  );
});

test('a vocabulary registered at startup is exported before the route module loads', async () => {
  registerRumVocabulary({ customInteractions: ['ask-opened'], pages: ['/'] });

  const interactions = await registry.getSingleMetricAsString('rum_interactions_total');
  assert.match(
    interactions,
    /rum_interactions_total\{interaction_type="ask-opened",page="\/",release="unknown"\} 0/
  );
});

test('the route factory still declares the vocabulary for callers that register nowhere else', async () => {
  createRumIngestRoute({ customInteractions: ['contact-sent'], pages: ['/'] });

  const interactions = await registry.getSingleMetricAsString('rum_interactions_total');
  assert.match(
    interactions,
    /rum_interactions_total\{interaction_type="contact-sent",page="\/",release="unknown"\} 0/
  );
});

test('a beacon from the public host is accepted while the server runs on its bind address', async () => {
  const before = await pageViews();

  const response = await post({ host: 'cv.zigordev.com', origin: 'https://cv.zigordev.com' });

  assert.equal(response.status, 204);
  assert.equal(await pageViews(), before + 1);
});

test('a beacon through a local port mapping is accepted', async () => {
  const response = await post({ host: 'localhost:3021', origin: 'http://localhost:3021' });

  assert.equal(response.status, 204);
});

test('a beacon with no Origin header is accepted', async () => {
  const response = await post({ host: 'cv.zigordev.com' });

  assert.equal(response.status, 204);
});

test('a beacon posted from another site is refused', async () => {
  const before = await pageViews();

  const response = await post({ host: 'cv.zigordev.com', origin: 'https://evil.example' });

  assert.equal(response.status, 403);
  assert.equal(await pageViews(), before);
});

test('an opaque origin is refused', async () => {
  const response = await post({ host: 'cv.zigordev.com', origin: 'null' });

  assert.equal(response.status, 403);
});

test('a request that names no host is refused', async () => {
  const response = await post({ origin: 'https://cv.zigordev.com' });

  assert.equal(response.status, 403);
});

test('the metrics route serves the registry in the format Prometheus scrapes', async () => {
  const GET = createMetricsRoute();

  const response = await GET();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/plain; version=0\.0\.4/);
  assert.match(await response.text(), /rum_navigations_total/);
});

const send = (events: unknown[]) =>
  POST(
    new Request('http://0.0.0.0:3001/rum/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: 'cv.zigordev.com',
        'x-forwarded-for': `203.0.113.${nextAddress++}`,
      },
      body: JSON.stringify({ events }),
    })
  );

const sample = async (metric: string, labels: Record<string, string>) => {
  const values = (await registry.getSingleMetric(metric)?.get())?.values ?? [];
  return (
    values.find((value) =>
      Object.entries(labels).every(([key, expected]) => value.labels[key] === expected)
    )?.value ?? 0
  );
};

const logged: Record<string, unknown>[] = [];

const captureLogs = () => {
  logged.length = 0;
  const capture = (chunk: string | Uint8Array) => {
    logged.push(JSON.parse(String(chunk)) as Record<string, unknown>);
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(capture as never);
  vi.spyOn(process.stderr, 'write').mockImplementation(capture as never);
};

afterEach(() => {
  vi.restoreAllMocks();
});

test('a refused cross-origin beacon is counted', async () => {
  const before = await sample('rum_rejected_total', { reason: 'cross_origin' });

  await post({ host: 'cv.zigordev.com', origin: 'https://evil.example' });

  assert.equal(await sample('rum_rejected_total', { reason: 'cross_origin' }), before + 1);
});

test("a page outside the app's routes is counted as other", async () => {
  const before = await sample('rum_navigations_total', { page: 'other' });

  await send([{ type: 'navigation', name: 'Page View', page: '/abc', navigationDepth: 1 }]);

  assert.equal(await sample('rum_navigations_total', { page: 'other' }), before + 1);
});

test('a browser error is logged once, with its message masked', async () => {
  captureLogs();
  const error = {
    type: 'error',
    name: 'JavaScript Error',
    page: '/',
    error: { type: 'TypeError', message: 'Failed for bob@example.com after 3 tries' },
  };

  await send([error, error]);

  const errors = logged.filter((line) => line.event === 'rum.client_error');
  assert.equal(errors.length, 1);
  assert.deepEqual(errors[0].error, {
    name: 'TypeError',
    message: 'Failed for <email> after <n> tries',
  });
});

test('a poor vital is logged with the element behind it', async () => {
  captureLogs();

  await send([
    {
      type: 'performance',
      name: 'INP',
      value: 640,
      page: '/',
      rating: 'poor',
      target: 'div>button',
    },
  ]);

  const poor = logged.find((line) => line.event === 'rum.vital_poor');
  assert.equal(poor?.metric, 'INP');
  assert.equal(poor?.target, 'div>button');
});

test('a trace id is accepted on a plain registry, which records no exemplar', async () => {
  const before = await sample('rum_performance_seconds', { metric_name: 'LCP' });

  const response = await send([
    { type: 'performance', name: 'LCP', value: 1800, page: '/', traceId: 'e'.repeat(32) },
  ]);

  assert.equal(response.status, 204);
  assert.ok((await registry.metrics()).includes('metric_name="LCP"'));
  assert.equal((await registry.metrics()).includes('trace_id'), false);
  assert.ok((await sample('rum_performance_seconds', { metric_name: 'LCP' })) >= before);
});
