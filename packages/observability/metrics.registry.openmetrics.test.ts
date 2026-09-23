import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const load = async () => (await import('./metrics.registry.openmetrics')).registry;

const source = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

const withoutRegistryConstruction = (text: string) =>
  text
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith('export const registry =') && !line.startsWith('registry.setContentType(')
    )
    .join('\n');

describe('openmetrics registry', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.OTEL_SERVICE_VERSION;
    delete process.env.APP_RELEASE;
    delete process.env.NEXT_PUBLIC_RELEASE;
  });

  it('reports the OpenMetrics content type, which is what enables exemplars', async () => {
    expect((await load()).contentType).toBe(
      'application/openmetrics-text; version=1.0.0; charset=utf-8'
    );
  });

  it('names a counter family without the _total its samples keep', async () => {
    const exposition = await (await load()).metrics();

    expect(exposition).toMatch(/^# TYPE process_cpu_seconds counter$/m);
    expect(exposition).toMatch(/^process_cpu_seconds_total /m);
  });

  it('terminates the exposition with EOF', async () => {
    expect(await (await load()).metrics()).toMatch(/\n# EOF\n?$/);
  });

  it('exports the release as service_build_info, like the plain registry', async () => {
    process.env.APP_RELEASE = 'v1.2.3';

    expect(await (await load()).metrics()).toContain('service_build_info{version="v1.2.3"} 1');
  });

  it('differs from the plain registry only in how the registry is constructed', () => {
    expect(withoutRegistryConstruction(source('metrics.registry.openmetrics.ts'))).toBe(
      withoutRegistryConstruction(source('metrics.registry.ts'))
    );
  });
});
