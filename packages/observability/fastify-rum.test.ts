import assert from 'node:assert/strict';

import { afterEach, beforeEach, test, vi } from 'vitest';

import { resetCspReports } from './csp-reports';
import { registerRumRoutes } from './fastify-rum';
import { registry } from './metrics.registry';

type Handler = (request: unknown, reply: unknown) => Promise<unknown>;
type ErrorHandler = (error: { statusCode?: number }, request: unknown, reply: unknown) => unknown;

const stubApp = () => {
  const routes: Record<string, Handler> = {};
  const parsers: { type: string; options: { parseAs: string; bodyLimit: number } }[] = [];
  let errorHandler: ErrorHandler | undefined;
  const scope = {
    removeAllContentTypeParsers: () => {
      parsers.length = 0;
    },
    addContentTypeParser: (type: string, options: { parseAs: string; bodyLimit: number }) => {
      parsers.push({ type, options });
    },
    setErrorHandler: (handler: ErrorHandler) => {
      errorHandler = handler;
    },
    post: (path: string, handler: Handler) => {
      routes[path] = handler;
    },
  };
  const app = { register: (plugin: (s: typeof scope) => Promise<void>) => plugin(scope) };
  registerRumRoutes(app as never, { pages: ['/'] });
  return { routes, parsers, errorHandler: () => errorHandler };
};

const reply = () => {
  const sent = { status: 0 };
  const stub = {
    code: (status: number) => {
      sent.status = status;
      return stub;
    },
    send: () => stub,
  };
  return { stub, sent };
};

const call = async (handler: Handler | undefined, request: Record<string, unknown>) => {
  const { stub, sent } = reply();
  await handler?.({ headers: {}, ip: '192.0.2.1', ...request }, stub);
  return sent.status;
};

const rejected = async (reason: string) => {
  const metric = await registry.getSingleMetric('rum_rejected_total')?.get();
  return metric?.values.find((value) => value.labels.reason === reason)?.value ?? 0;
};

beforeEach(() => {
  resetCspReports();
  vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
  vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('bodies are read raw, whatever their type, and capped at the same size as the Next routes', () => {
  const { parsers } = stubApp();

  assert.deepEqual(parsers, [{ type: '*', options: { parseAs: 'string', bodyLimit: 64 * 1024 } }]);
});

test('a same-origin batch is accepted with nothing to say', async () => {
  const { routes } = stubApp();

  const status = await call(routes['/rum/events'], {
    headers: { origin: 'http://localhost:3031', host: 'localhost:3031' },
    body: JSON.stringify({ events: [] }),
  });

  assert.equal(status, 204);
});

test('a batch from another origin is refused and counted', async () => {
  const { routes } = stubApp();
  const before = await rejected('cross_origin');

  const status = await call(routes['/rum/events'], {
    headers: { origin: 'https://evil.example', host: 'localhost:3031' },
    body: JSON.stringify({ events: [] }),
  });

  assert.equal(status, 403);
  assert.equal(await rejected('cross_origin'), before + 1);
});

test('a body that is not JSON is refused', async () => {
  const { routes } = stubApp();

  assert.equal(await call(routes['/rum/events'], { body: '{not json' }), 400);
  assert.equal(await call(routes['/rum/events'], { body: undefined }), 400);
});

test('without a proxy in front, each socket address gets its own rate limit', async () => {
  const { routes } = stubApp();
  const batch = { body: JSON.stringify({ events: [] }) };

  for (let i = 0; i < 60; i += 1) {
    assert.equal(await call(routes['/rum/events'], { ...batch, ip: '198.51.100.20' }), 204);
  }

  assert.equal(await call(routes['/rum/events'], { ...batch, ip: '198.51.100.20' }), 429);
  assert.equal(await call(routes['/rum/events'], { ...batch, ip: '198.51.100.21' }), 204);
});

test('a CSP report is recorded and a malformed one is counted', async () => {
  const { routes } = stubApp();
  const before = await rejected('csp_malformed');
  const report = {
    'csp-report': {
      'document-uri': 'http://localhost:3031/',
      'effective-directive': 'script-src-elem',
      'blocked-uri': 'inline',
    },
  };

  assert.equal(await call(routes['/rum/csp'], { body: JSON.stringify(report) }), 204);
  assert.equal(await call(routes['/rum/csp'], { body: 'nope' }), 400);
  assert.equal(await rejected('csp_malformed'), before + 1);
});

test('a client error from the parser keeps its status and says nothing; a server error is passed on', () => {
  const { errorHandler } = stubApp();
  const { stub, sent } = reply();

  errorHandler()?.({ statusCode: 413 }, {}, stub);
  assert.equal(sent.status, 413);

  assert.throws(() => errorHandler()?.({ statusCode: 500 }, {}, stub));
  assert.throws(() => errorHandler()?.({}, {}, stub));
});
