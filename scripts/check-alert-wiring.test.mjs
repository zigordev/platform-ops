import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  PATHS,
  audit,
  inhibitBlock,
  matches,
  parseInhibitRules,
  readAlerts,
  runbookGroups,
} from './check-alert-wiring.mjs';

const INHIBIT = `inhibit_rules:
  - source_matchers:
      - alertname="ServiceDown"
    target_matchers:
      - alertname=~"ServiceUnhealthy|ErrorLogsSpiking|PoolsSync.*"
    equal: ['environment', 'job']
  - source_matchers:
      - alertname="RedpandaDown"
    target_matchers:
      - alertname=~"KafkaConsumerLagGrowing"
    equal: ['environment']

receivers:
  - name: sink
`;

const RUNBOOKS = `# Runbooks

| Alert | Runbook |
| ----- | ------- |
| \`ServiceDown\` | [service-down.md](service-down.md) |
| \`ServiceUnhealthy\` | [service-unhealthy.md](service-unhealthy.md) |
| \`PoolsSync*\` | [pools-sync.md](pools-sync.md) |
| \`KafkaConsumerLagGrowing\` | [kafka-lag.md](kafka-lag.md) |
| \`RedpandaDown\` | [redpanda-down.md](redpanda-down.md) |
| \`ErrorLogsSpiking\`, \`UncaughtExceptions\` | [error-logs.md](error-logs.md) |
`;

const PROM_ALERTS = [
  'ServiceDown',
  'ServiceUnhealthy',
  'PoolsSyncRunFailed',
  'PoolsSyncFeedBroken',
  'KafkaConsumerLagGrowing',
  'RedpandaDown',
]
  .map((name) => `      - alert: ${name}\n        expr: up == 0\n`)
  .join('');

const LOKI_ALERTS = ['ErrorLogsSpiking', 'UncaughtExceptions']
  .map(
    (name) =>
      `      - alert: ${name}\n        expr: sum by (app) (rate({job="docker-json-logs"}[5m])) > 1\n`
  )
  .join('');

let root;

function put(relative, body) {
  const full = join(root, relative);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}

function scrape(jobs) {
  return `scrape_configs:\n${jobs.map((job) => `  - job_name: '${job}'\n`).join('')}`;
}

function build({ localJobs, prodJobs, exceptions, inhibit = INHIBIT, prodInhibit = INHIBIT }) {
  put(PATHS.scrapeLocal, scrape(localJobs));
  put(PATHS.scrapeProd, scrape(prodJobs));
  put(PATHS.alerts, `groups:\n  - name: a\n    rules:\n${PROM_ALERTS}`);
  put(
    `${PATHS.lokiRules}/fake/log-alerts.yml`,
    `groups:\n  - name: logs\n    rules:\n${LOKI_ALERTS}`
  );
  put(PATHS.alertmanagerLocal, `route:\n  receiver: sink\n\n${inhibit}`);
  put(PATHS.alertmanagerProd, `route:\n  receiver: mail\n\n${prodInhibit}`);
  put(PATHS.runbooks, RUNBOOKS);
  if (exceptions) put(PATHS.exceptions, `${JSON.stringify(exceptions, null, 2)}\n`);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'alert-wiring-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('parsing', () => {
  it('slices the inhibit block off a larger config', () => {
    const block = inhibitBlock(`route:\n  receiver: sink\n\n${INHIBIT}`);
    expect(block.startsWith('inhibit_rules:')).toBe(true);
    expect(block).not.toContain('receivers:');
  });

  it('reads the source, the targets and the equal list of every rule', () => {
    const rules = parseInhibitRules(inhibitBlock(`\n${INHIBIT}`));
    expect(rules).toHaveLength(2);
    expect(rules[0].source).toEqual(['ServiceDown']);
    expect(rules[0].targets).toEqual(['ServiceUnhealthy', 'ErrorLogsSpiking', 'PoolsSync.*']);
    expect(rules[0].equal).toEqual(['environment', 'job']);
    expect(rules[1].equal).toEqual(['environment']);
  });

  it('expands a trailing wildcard and nothing else', () => {
    expect(matches('PoolsSync.*', 'PoolsSyncRunFailed')).toBe(true);
    expect(matches('PoolsSync.*', 'PoolsSync')).toBe(true);
    expect(matches('ServiceDown', 'ServiceDownstream')).toBe(false);
  });

  it('groups the alerts that share a runbook row', () => {
    const groups = runbookGroups(RUNBOOKS);
    expect(groups).toContainEqual(['ErrorLogsSpiking', 'UncaughtExceptions']);
    expect(groups).toContainEqual(['PoolsSync.*']);
  });

  it('remembers which alerts come from loki', () => {
    build({ localJobs: ['a'], prodJobs: ['a'] });
    const alerts = readAlerts(root);
    expect(alerts.get('ServiceDown')).toBe('prometheus');
    expect(alerts.get('ErrorLogsSpiking')).toBe('loki');
  });
});

describe('audit', () => {
  it('passes a config with no gaps', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      exceptions: {
        'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
        'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
      },
    });
    expect(audit(root).findings).toEqual([]);
  });

  it('catches a product scraped locally and not in prod', () => {
    build({
      localJobs: ['cv-web', 'sity-web'],
      prodJobs: ['cv-web'],
      exceptions: {
        'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
        'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
      },
    });
    expect(audit(root).findings).toEqual(['sity-web is scraped but is in no prod config']);
  });

  it('catches inhibit blocks that have drifted apart', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      prodInhibit: INHIBIT.replace('|PoolsSync.*', ''),
      exceptions: {
        'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
        'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
      },
    });
    expect(audit(root).findings).toContain('local and prod inhibit_rules blocks differ');
  });

  it('catches a matcher naming an alert that no longer exists', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      inhibit: INHIBIT.replace('ServiceUnhealthy|', 'ServiceWobbly|'),
      prodInhibit: INHIBIT.replace('ServiceUnhealthy|', 'ServiceWobbly|'),
      exceptions: {
        'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
        'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
      },
    });
    expect(audit(root).findings).toContain(
      'inhibit rule 1 matches ServiceWobbly, which is not a defined alert'
    );
  });

  it('catches a log alert inhibited on a label it cannot carry', () => {
    build({ localJobs: ['cv-web'], prodJobs: ['cv-web'] });
    expect(audit(root).findings).toContain(
      'inhibit rule 1 matches ErrorLogsSpiking on job, which a log alert never carries'
    );
  });

  it('catches a sibling left out of a rule that covers the rest of its row', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      exceptions: { 'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }] },
    });
    expect(audit(root).findings).toContain(
      'inhibit rule 1 covers ErrorLogsSpiking but not its sibling UncaughtExceptions'
    );
  });

  it('never calls a rule source its own missing sibling', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      exceptions: {
        'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
        'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
      },
    });
    expect(audit(root).findings.join(' ')).not.toContain('RedpandaDown');
  });

  it('catches an alert with no runbook row', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      exceptions: {
        'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
        'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
      },
    });
    writeFileSync(
      join(root, PATHS.alerts),
      `groups:\n  - name: a\n    rules:\n${PROM_ALERTS}      - alert: BrandNewAlert\n        expr: up == 0\n`
    );
    expect(audit(root).findings).toContain(`BrandNewAlert has no row in ${PATHS.runbooks}`);
  });

  it('rejects an exception with no reason', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      exceptions: {
        'inhibit-labels': [{ name: 'ErrorLogsSpiking' }],
        'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
      },
    });
    expect(audit(root).findings).toContain(
      'exception inhibit-labels/ErrorLogsSpiking has no reason'
    );
  });
});

describe('this repository', () => {
  it('has no undeclared observability parity gap', () => {
    expect(audit(process.cwd()).findings).toEqual([]);
  });
});
