import { beforeEach, describe, expect, it, vi } from 'vitest';

const load = async () => (await import('./metrics.registry')).registry;

describe('metrics registry', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.OTEL_SERVICE_VERSION;
    delete process.env.APP_RELEASE;
    delete process.env.NEXT_PUBLIC_RELEASE;
  });

  it('exports the release as service_build_info', async () => {
    process.env.APP_RELEASE = 'v1.2.3';

    expect(await (await load()).metrics()).toContain('service_build_info{version="v1.2.3"} 1');
  });

  it('prefers the OpenTelemetry service version over the other release variables', async () => {
    process.env.OTEL_SERVICE_VERSION = 'v2.0.0';
    process.env.APP_RELEASE = 'v1.2.3';
    process.env.NEXT_PUBLIC_RELEASE = 'v0.1.0';

    expect(await (await load()).metrics()).toContain('service_build_info{version="v2.0.0"} 1');
  });

  it('falls back to the Next.js release variable the web apps already set', async () => {
    process.env.NEXT_PUBLIC_RELEASE = 'v0.1.0';

    expect(await (await load()).metrics()).toContain('service_build_info{version="v0.1.0"} 1');
  });

  it('reports dev when no release variable is set', async () => {
    expect(await (await load()).metrics()).toContain('service_build_info{version="dev"} 1');
  });

  it('keeps the process defaults in the same registry', async () => {
    expect(await (await load()).metrics()).toMatch(/^# TYPE process_cpu_seconds_total counter$/m);
  });
});
