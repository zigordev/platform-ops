import assert from 'node:assert/strict';

import { test } from 'vitest';

import { createMetricsRoute, createRumIngestRoute, registry } from './next';

const POST = createRumIngestRoute();

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

  assert.match(frustrations, /rum_frustrations_total\{frustration_type="dead_click",page="\/"\} 0/);
  assert.match(frustrations, /rum_frustrations_total\{frustration_type="rage_click",page="\/"\} 0/);
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
