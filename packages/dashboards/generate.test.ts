import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { DASHBOARDS } from './dashboards/index.ts';
import { onDisk, render, ROOT, TARGET } from './generate.ts';
import { build } from './lib/dashboard.ts';
import { FOLDERS } from './lib/folders.ts';
import { metricNames, METRICS } from './lib/metrics.ts';
import { layout, type Dashboard, type Target } from './lib/model.ts';
import { timeseries } from './lib/panels.ts';
import { prom } from './lib/queries.ts';

const dashboards: Dashboard[] = DASHBOARDS.map(build);

function promExprs(dashboard: Dashboard): string[] {
  const panels = dashboard.panels.flatMap((panel) => panel.targets as Target[]);
  const queries = panels.filter((target) => target.datasource.type === 'prometheus').map((target) => String(target.expr));
  const annotations = (dashboard.annotations as { list: { target?: { expr: string } }[] }).list
    .map((annotation) => annotation.target?.expr)
    .filter((expr): expr is string => Boolean(expr));
  return [...queries, ...annotations];
}

function alertDashboards(file: string): Map<string, string | undefined> {
  const text = readFileSync(join(ROOT, file), 'utf8');
  const found = new Map<string, string | undefined>();
  for (const block of text.split(/\n\s*- (?=alert:|record:)/).slice(1)) {
    const alert = /^alert:\s*(\S+)/.exec(block)?.[1];
    if (!alert) continue;
    found.set(alert, /\n\s+dashboard:\s*'([^']+)'/.exec(block)?.[1]);
  }
  return found;
}

describe('the generated dashboards', () => {
  let files: Map<string, string>;

  beforeAll(async () => {
    files = await render();
  });

  it('are what is committed: run `npm run dashboards` after changing a dashboard', () => {
    for (const [path, content] of files) {
      expect(readFileSync(join(TARGET, path), 'utf8'), path).toBe(content);
    }
  });

  it('leave no file behind that the generator does not write', async () => {
    expect(await onDisk()).toEqual([...files.keys()].sort());
  });

  it('give every folder its own provider and at least one dashboard', () => {
    const providers = files.get('dashboards.yml') ?? '';
    for (const folder of FOLDERS) {
      expect(providers).toContain(`folderUid: ${folder.uid}`);
      expect(DASHBOARDS.some((spec) => spec.folder === folder), folder.name).toBe(true);
    }
  });
});

describe('every dashboard', () => {
  it('has a unique uid Grafana accepts', () => {
    const uids = dashboards.map((dashboard) => dashboard.uid);
    expect(new Set(uids).size).toBe(uids.length);
    for (const uid of uids) expect(uid).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  it('has a unique title', () => {
    const titles = dashboards.map((dashboard) => dashboard.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('numbers its panels once each, so a link to a panel stays put', () => {
    for (const dashboard of dashboards) {
      const ids = dashboard.panels.map((panel) => panel.id);
      expect(ids, dashboard.uid).toEqual(ids.map((_, index) => index + 1));
    }
  });

  it('marks deploys', () => {
    for (const dashboard of dashboards) {
      const list = (dashboard.annotations as { list: { name: string }[] }).list;
      expect(list.map((annotation) => annotation.name), dashboard.uid).toContain('Deploys');
    }
  });

  it('describes every panel', () => {
    for (const dashboard of dashboards) {
      for (const panel of dashboard.panels) {
        expect(String(panel.description ?? ''), `${dashboard.uid} › ${panel.title}`).not.toBe('');
      }
    }
  });

  it('queries only metrics that exist', () => {
    for (const dashboard of dashboards) {
      for (const expr of promExprs(dashboard)) {
        for (const name of metricNames(expr)) {
          expect(METRICS.has(name), `${dashboard.uid}: ${name} in ${expr}`).toBe(true);
        }
      }
    }
  });

  it('reads single-value tiles at this instant, so they show the value now', () => {
    for (const dashboard of dashboards) {
      for (const panel of dashboard.panels.filter((panel) => panel.type === 'stat' || panel.type === 'gauge')) {
        for (const target of (panel.targets as Target[]).filter((target) => target.datasource.type === 'prometheus')) {
          expect(target.instant, `${dashboard.uid} › ${String(panel.title)}`).toBe(true);
          expect(target.range, `${dashboard.uid} › ${String(panel.title)}`).toBe(false);
        }
      }
    }
  });

  it('asks for exemplars only on range queries', () => {
    for (const dashboard of dashboards) {
      for (const target of dashboard.panels.flatMap((panel) => panel.targets)) {
        if (target.exemplar) expect(target.range, `${dashboard.uid} › ${String(target.expr)}`).toBe(true);
      }
    }
  });
});

describe('every alert', () => {
  const uids = new Set(dashboards.map((dashboard) => dashboard.uid));

  for (const file of ['docker/prometheus/alerts.yml', 'docker/loki/rules/fake/log-alerts.yml']) {
    it(`in ${file} links a dashboard that exists`, () => {
      const alerts = alertDashboards(file);
      expect(alerts.size).toBeGreaterThan(0);
      for (const [alert, uid] of alerts) {
        expect(uid, alert).toBeDefined();
        expect(uids.has(uid ?? ''), `${alert} links ${uid}`).toBe(true);
      }
    });
  }
});

describe('metricNames', () => {
  it('finds the metrics and leaves functions, labels and durations out', () => {
    expect(metricNames('histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="cv-web", le="0.5"}[$__rate_interval])))')).toEqual([
      'http_request_duration_seconds_bucket',
    ]);
  });

  it('reads recording rules, set operators and offsets', () => {
    expect(metricNames('max by (job, version) (service_build_info) unless on (job, version) deploy:version_seen:max3d offset 10m')).toEqual([
      'service_build_info',
      'deploy:version_seen:max3d',
    ]);
  });

  it('reads both sides of an arithmetic expression', () => {
    expect(metricNames('count(up == 0) or vector(0)')).toEqual(['up']);
    expect(metricNames('time() - max(node_boot_time_seconds)')).toEqual(['node_boot_time_seconds']);
    expect(metricNames('min(node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)')).toEqual([
      'node_memory_MemAvailable_bytes',
      'node_memory_MemTotal_bytes',
    ]);
  });
});

describe('layout', () => {
  it('refuses a row wider than the grid', () => {
    const wide = timeseries('wide', 'too wide', { w: 16, h: 4 }, [prom('up')]);
    expect(() => layout([[wide, wide]])).toThrow(/wider than 24 columns/);
  });

  it('stacks rows under the tallest panel of the row above', () => {
    const tall = timeseries('tall', 'tall', { w: 12, h: 9 }, [prom('up')]);
    const short = timeseries('short', 'short', { w: 12, h: 4 }, [prom('up')]);
    const panels = layout([[tall, short], [short]]);
    expect(panels.map((panel) => panel.gridPos)).toEqual([
      { x: 0, y: 0, w: 12, h: 9 },
      { x: 12, y: 0, w: 12, h: 4 },
      { x: 0, y: 9, w: 12, h: 4 },
    ]);
    expect(panels[0]?.targets[0]?.refId).toBe('A');
  });
});
