import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { recordCspReports } from './csp-reports';
import { clientKeyFrom, ingestRumBatch, MAX_BODY_BYTES } from './rum-ingest';
import { allowCustomInteractions, allowPages, rumRejectedTotal } from './rum-metrics';

export interface RumRouteOptions {
  readonly allowedOrigin?: string;
  readonly customInteractions?: readonly string[];
  readonly pages?: readonly string[];
}

export function registerRumRoutes(app: FastifyInstance, options: RumRouteOptions = {}): void {
  if (options.customInteractions?.length) allowCustomInteractions(options.customInteractions);
  if (options.pages?.length) allowPages(options.pages);

  void app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      '*',
      { parseAs: 'string', bodyLimit: MAX_BODY_BYTES },
      (_request, body, done) => done(null, body)
    );
    scope.setErrorHandler((error: { statusCode?: number }, _request, reply) => {
      if (error.statusCode === undefined || error.statusCode >= 500) throw error;
      return reply.code(error.statusCode).send();
    });

    scope.post('/rum/events', async (request, reply) => {
      const origin = header(request, 'origin');
      if (origin && !isSameOrigin(origin, header(request, 'host'), options.allowedOrigin)) {
        rumRejectedTotal.inc({ reason: 'cross_origin' });
        return empty(reply, 403);
      }

      const body = parseJson(request.body);
      if (body === undefined) return empty(reply, 400);

      const outcome = ingestRumBatch(body, clientKeyFrom(headersOf(request)));
      if (!outcome.ok) return empty(reply, outcome.status);
      await Promise.allSettled(outcome.details);

      return empty(reply, 204);
    });

    scope.post('/rum/csp', async (request, reply) => {
      const body = parseJson(request.body);
      if (body === undefined) {
        rumRejectedTotal.inc({ reason: 'csp_malformed' });
        return empty(reply, 400);
      }

      const outcome = recordCspReports(body, clientKeyFrom(headersOf(request)));
      return empty(reply, outcome.ok ? 204 : outcome.status);
    });
  });
}

function empty(reply: FastifyReply, status: number): FastifyReply {
  return reply.code(status).send();
}

function parseJson(body: unknown): unknown {
  if (typeof body !== 'string' || body.length > MAX_BODY_BYTES) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function headersOf(request: FastifyRequest): { get(name: string): string | null } {
  return {
    get: (name) => {
      const lower = name.toLowerCase();
      return header(request, lower) ?? (lower === 'x-real-ip' ? request.ip : undefined) ?? null;
    },
  };
}

function isSameOrigin(origin: string, host: string | undefined, allowedOrigin?: string): boolean {
  if (allowedOrigin) return origin === allowedOrigin;
  if (!host) return false;
  try {
    return new URL(origin).host === host.toLowerCase();
  } catch {
    return false;
  }
}
