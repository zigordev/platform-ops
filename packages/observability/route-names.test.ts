import { ROOT_CONTEXT } from '@opentelemetry/api';
import { getRPCMetadata, RPCType, setRPCMetadata } from '@opentelemetry/core';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import { describe, expect, it } from 'vitest';

import { RouteNameProcessor } from './route-names';

import type { Attributes, Context, Span as ApiSpan } from '@opentelemetry/api';
import type { RPCMetadata } from '@opentelemetry/core';
import type { ReadableSpan, Span } from '@opentelemetry/sdk-trace-base';

const processor = new RouteNameProcessor();

const serverSpan = {} as ApiSpan;

const routerSpan = (attributes: Attributes) => ({ attributes }) as unknown as Span;

const requestHandler = (route: string) =>
  routerSpan({
    'router.type': 'request_handler',
    'router.name': 'stats',
    [ATTR_HTTP_ROUTE]: route,
  });

const middleware = (route: string) =>
  routerSpan({
    'router.type': 'middleware',
    'router.name': 'corsMiddleware',
    [ATTR_HTTP_ROUTE]: route,
  });

const underServerSpan = () =>
  setRPCMetadata(ROOT_CONTEXT, { type: RPCType.HTTP, span: serverSpan });

const promoted = (span: Span, context: Context) => {
  processor.onStart(span, context);
  return getRPCMetadata(context)?.route;
};

describe('route name processor', () => {
  it('promotes the route the router resolved onto the request it belongs to', () => {
    expect(promoted(requestHandler('/fut-pools/stats'), underServerSpan())).toBe(
      '/fut-pools/stats'
    );
  });

  it('ignores a middleware span, which carries the mount point rather than the route', () => {
    const context = underServerSpan();

    processor.onStart(requestHandler('/fut-pools/stats'), context);
    processor.onStart(middleware('/'), context);

    expect(getRPCMetadata(context)?.route).toBe('/fut-pools/stats');
  });

  it('ignores a span the router instrumentation did not produce', () => {
    expect(
      promoted(routerSpan({ [ATTR_HTTP_ROUTE]: '/stats' }), underServerSpan())
    ).toBeUndefined();
  });

  it('ignores a request handler with no route, rather than naming the span undefined', () => {
    expect(promoted(requestHandler(''), underServerSpan())).toBeUndefined();
    expect(
      promoted(routerSpan({ 'router.type': 'request_handler' }), underServerSpan())
    ).toBeUndefined();
  });

  it('does nothing outside an HTTP server span', () => {
    expect(() => processor.onStart(requestHandler('/stats'), ROOT_CONTEXT)).not.toThrow();
    expect(getRPCMetadata(ROOT_CONTEXT)?.route).toBeUndefined();
  });

  it('leaves metadata that is not an HTTP request alone', () => {
    const context = setRPCMetadata(ROOT_CONTEXT, {
      type: 'grpc',
      span: serverSpan,
    } as unknown as RPCMetadata);

    expect(promoted(requestHandler('/stats'), context)).toBeUndefined();
  });

  it('exports nothing and needs no flushing of its own', async () => {
    expect(processor.onEnd({} as ReadableSpan)).toBeUndefined();
    await expect(processor.forceFlush()).resolves.toBeUndefined();
    await expect(processor.shutdown()).resolves.toBeUndefined();
  });
});
