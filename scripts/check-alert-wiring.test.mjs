import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  PATHS,
  audit,
  dashboardServices,
  logAlertApps,
  inhibitBlock,
  matches,
  goMemoryLimits,
  memoryCaps,
  memoryDivisors,
  parseInhibitRules,
  readAlerts,
  runbookGroups,
  toBytes,
  toGoBytes,
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

function lokiAlerts(withLabels, apps) {
  const selector = apps
    ? `{job="docker-json-logs", app=~"${apps.join('|')}"}`
    : '{job="docker-json-logs"}';
  return ['ErrorLogsSpiking', 'UncaughtExceptions']
    .map(
      (name) =>
        `      - alert: ${name}\n        expr: sum by (app) (rate(${selector}[5m])) > 1\n` +
        (withLabels ? `        labels:\n          job: '{{ $labels.app }}'\n` : '') +
        `        annotations:\n          summary: 'read {app="{{ $labels.app }}"}'\n`
    )
    .join('');
}

const LOKI_ALERTS = lokiAlerts(false);

let root;

function put(relative, body) {
  const full = join(root, relative);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}

function scrape(jobs) {
  return `scrape_configs:\n${jobs.map((job) => `  - job_name: '${job}'\n`).join('')}`;
}

function compose(name, limit, soft) {
  return (
    `name: ${name}\n\nservices:\n  tempo:\n    image: grafana/tempo:2.8.1\n` +
    (limit ? `    mem_limit: ${limit}\n` : '') +
    (soft ? `    environment:\n      GOMEMLIMIT: ${soft}\n` : '') +
    '    networks: [platform_ops_shared]\n'
  );
}

function build({
  localJobs,
  prodJobs,
  exceptions,
  lokiLabels = false,
  lokiApps,
  dashboards,
  inhibit = INHIBIT,
  prodInhibit = INHIBIT,
  localLimit,
  prodLimit,
  localSoft,
  prodSoft,
  memoryAlert,
  memoryFraction = '0.8',
}) {
  put(PATHS.scrapeLocal, scrape(localJobs));
  put(PATHS.scrapeProd, scrape(prodJobs));
  put(
    PATHS.alerts,
    `groups:\n  - name: a\n    rules:\n${PROM_ALERTS}${
      memoryAlert
        ? `      - alert: TempoMemoryNearLimit\n        expr: |\n          process_resident_memory_bytes{job="tempo"} / ${memoryAlert} > ${memoryFraction}\n`
        : ''
    }`
  );
  put(
    `${PATHS.lokiRules}/fake/log-alerts.yml`,
    `groups:\n  - name: logs\n    rules:\n${lokiAlerts(lokiLabels, lokiApps)}`
  );
  for (const service of dashboards ?? [])
    put(
      `${PATHS.dashboards}/service-${service}.ts`,
      `export const spec = {\n  uid: 'service-${service}',\n  title: '${service}',\n};\n`
    );
  put(PATHS.alertmanagerLocal, `route:\n  receiver: sink\n\n${inhibit}`);
  put(PATHS.alertmanagerProd, `route:\n  receiver: mail\n\n${prodInhibit}`);
  put(PATHS.runbooks, RUNBOOKS);
  if (exceptions) put(PATHS.exceptions, `${JSON.stringify(exceptions, null, 2)}\n`);
  if (localLimit !== undefined)
    put(PATHS.composeLocal, compose('platform-ops-local', localLimit, localSoft));
  if (prodLimit !== undefined)
    put(PATHS.composeProd, compose('platform-ops-prod', prodLimit, prodSoft));
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

  it('catches a log alert inhibited on a label its rule does not set', () => {
    build({ localJobs: ['cv-web'], prodJobs: ['cv-web'] });
    expect(audit(root).findings).toContain(
      'inhibit rule 1 matches ErrorLogsSpiking on job, which its rule does not set'
    );
  });

  it('accepts a log alert whose rule sets the label the inhibit compares', () => {
    build({ localJobs: ['cv-web'], prodJobs: ['cv-web'], lokiLabels: true });
    expect(audit(root).findings.join(' ')).not.toContain('on job');
  });

  it('catches an exception that no longer suppresses anything', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      lokiLabels: true,
      exceptions: { 'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'was the job gap' }] },
    });
    expect(audit(root).findings).toContain(
      'exception inhibit-labels/ErrorLogsSpiking suppresses nothing — remove it'
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

describe('memory limits', () => {
  it('reads a limit per service and understands the suffixes', () => {
    expect([...memoryCaps(compose('x', '1g'))]).toEqual([['tempo', 1073741824]]);
    expect(memoryCaps(compose('x', null)).size).toBe(0);
    expect(toBytes('512m')).toBe(536870912);
    expect(toBytes('nonsense')).toBe(null);
  });

  it('reads the divisor out of the alert that watches a limit', () => {
    expect(
      memoryDivisors(
        '      - alert: TempoMemoryNearLimit\n        expr: |\n          process_resident_memory_bytes{job="tempo"} / 1073741824 > 0.8\n'
      )
    ).toEqual([{ alert: 'TempoMemoryNearLimit', job: 'tempo', bytes: 1073741824, fraction: 0.8 }]);
  });

  it('catches a limit raised in one environment only', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      localLimit: '1g',
      prodLimit: '512m',
      memoryAlert: '1073741824',
      exceptions: {
        'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
        'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
        'runbook-rows': [{ name: 'TempoMemoryNearLimit', reason: 'not the subject here' }],
      },
    });
    expect(audit(root).findings).toContain(
      'tempo is capped at 1073741824 locally and 536870912 in prod'
    );
  });

  it('catches an alert left behind by a raised limit', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      localLimit: '1g',
      prodLimit: '1g',
      memoryAlert: '536870912',
      exceptions: {
        'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
        'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
        'runbook-rows': [{ name: 'TempoMemoryNearLimit', reason: 'not the subject here' }],
      },
    });
    expect(audit(root).findings).toContain(
      'TempoMemoryNearLimit divides by 536870912, but tempo is capped at 1073741824'
    );
  });

  it('catches a capped container that no alert watches', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      localLimit: '1g',
      prodLimit: '1g',
      exceptions: {
        'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
        'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
      },
    });
    expect(audit(root).findings).toContain('tempo has a memory limit that no alert watches');
  });

  it('passes a limit that matches in both environments and in its alert', () => {
    build({
      localJobs: ['cv-web'],
      prodJobs: ['cv-web'],
      localLimit: '1g',
      prodLimit: '1g',
      localSoft: '700MiB',
      prodSoft: '700MiB',
      memoryAlert: '1073741824',
      exceptions: {
        'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
        'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
        'runbook-rows': [{ name: 'TempoMemoryNearLimit', reason: 'not the subject here' }],
      },
    });
    expect(audit(root).findings).toEqual([]);
  });

  it('reads a runtime limit per service and takes only the suffixes Go takes', () => {
    expect([...goMemoryLimits(compose('x', '1g', '900MiB'))]).toEqual([['tempo', 943718400]]);
    expect(goMemoryLimits(compose('x', '1g')).size).toBe(0);
    expect(
      goMemoryLimits('services:\n  tempo:\n    environment:\n      - GOMEMLIMIT=1GiB\n')
    ).toEqual(new Map([['tempo', 1073741824]]));
    expect(toGoBytes('512MiB')).toBe(536870912);
    expect(toGoBytes('512m')).toBe(null);
  });

  it('keeps a runtime limit Go would reject as text rather than reading it as nothing', () => {
    expect([...goMemoryLimits(compose('x', '1g', '900m'))]).toEqual([['tempo', '900m']]);
  });
});

describe('a runtime limit under a memory limit', () => {
  const exceptions = {
    'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
    'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
    'runbook-rows': [{ name: 'TempoMemoryNearLimit', reason: 'not the subject here' }],
  };
  const base = {
    localJobs: ['cv-web'],
    prodJobs: ['cv-web'],
    localLimit: '1g',
    prodLimit: '1g',
    localSoft: '900MiB',
    prodSoft: '900MiB',
    memoryAlert: '1073741824',
    memoryFraction: '0.92',
    exceptions,
  };

  it('passes when the alert sits between the two limits', () => {
    build(base);
    expect(audit(root).findings).toEqual([]);
  });

  it('catches an alert that would fire on memory the runtime is allowed to use', () => {
    build({ ...base, memoryFraction: '0.85' });
    expect(audit(root).findings).toContain(
      'TempoMemoryNearLimit fires at 912680550, at or below the 943718400 tempo is allowed to use'
    );
  });

  it('catches an alert that only fires once the ceiling is already reached', () => {
    build({ ...base, memoryFraction: '1.05' });
    expect(audit(root).findings).toContain(
      'TempoMemoryNearLimit fires at 1127428915, at or above the 1073741824 ceiling it is meant to warn about'
    );
  });

  it('catches a runtime limit the memory limit cannot honour', () => {
    build({ ...base, localSoft: '1200MiB', prodSoft: '1200MiB' });
    expect(audit(root).findings).toContain(
      'tempo asks the runtime for 1258291200, which its 1073741824 memory limit cannot give it'
    );
  });

  it('catches a runtime limit set in one environment only', () => {
    build({ ...base, localSoft: undefined });
    expect(audit(root).findings).toContain(
      'tempo asks the runtime for nothing locally and 943718400 in prod'
    );
  });

  it('catches a runtime limit in a unit Go does not take', () => {
    build({ ...base, localSoft: '900m', prodSoft: '900m' });
    expect(audit(root).findings).toContain(
      'tempo asks the runtime for 900m locally, which Go does not accept — it takes B, KiB, MiB, GiB or TiB'
    );
  });
});

describe('the services the log alerts watch', () => {
  const base = {
    localJobs: ['cv-web'],
    prodJobs: ['cv-web'],
    dashboards: ['cv-web', 'gpool-api', 'overview'],
    lokiApps: ['cv-web', 'gpool-api'],
    lokiLabels: true,
    exceptions: {
      'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
    },
  };

  it('reads the list out of the rule and the services off their dashboards', () => {
    build(base);
    expect(dashboardServices(root)).toEqual(['cv-web', 'gpool-api']);
    expect(logAlertApps(root).get('ErrorLogsSpiking').listed).toEqual(
      new Set(['cv-web', 'gpool-api'])
    );
  });

  it('passes when the list names every service and nothing else', () => {
    build(base);
    expect(audit(root).findings).toEqual([]);
  });

  it('catches an app in the list that is no service of ours', () => {
    build({ ...base, lokiApps: ['cv-web', 'gpool-api', 'gpool-api-test'] });
    expect(audit(root).findings).toContain(
      'ErrorLogsSpiking watches gpool-api-test, which is not a service in this estate'
    );
  });

  it('catches a service the list has fallen behind on', () => {
    build({ ...base, lokiApps: ['cv-web'] });
    expect(audit(root).findings).toContain(
      'ErrorLogsSpiking leaves out gpool-api, which has a service dashboard'
    );
  });

  it('lets a declared exception hold a service out of one alert', () => {
    build({
      ...base,
      lokiApps: ['cv-web'],
      exceptions: {
        ...base.exceptions,
        'log-alert-apps': [
          { name: 'ErrorLogsSpiking:gpool-api', reason: 'deliberate' },
          { name: 'UncaughtExceptions:gpool-api', reason: 'deliberate' },
        ],
      },
    });
    expect(audit(root).findings).toEqual([]);
  });

  it('reads no app out of an annotation that quotes the label', () => {
    build({ ...base, lokiApps: undefined });
    expect(logAlertApps(root).size).toBe(0);
  });
});

describe('a capped container with no runtime limit', () => {
  const base = {
    localJobs: ['cv-web'],
    prodJobs: ['cv-web'],
    localLimit: '1g',
    prodLimit: '1g',
    memoryAlert: '1073741824',
    memoryFraction: '0.92',
    exceptions: {
      'inhibit-labels': [{ name: 'ErrorLogsSpiking', reason: 'known' }],
      'inhibit-siblings': [{ name: '1:UncaughtExceptions', reason: 'known' }],
      'runbook-rows': [{ name: 'TempoMemoryNearLimit', reason: 'not the subject here' }],
    },
  };

  it('catches a limit the runtime was never told about', () => {
    build(base);
    expect(audit(root).findings).toContain(
      'tempo is capped at 1073741824 and asks the runtime for nothing, so the kernel kills it instead of the runtime giving memory back'
    );
  });

  it('lets a declared exception through for a runtime that has no such knob', () => {
    build({
      ...base,
      exceptions: {
        ...base.exceptions,
        'runtime-memory-limits': [{ name: 'tempo', reason: 'not a Go runtime' }],
      },
    });
    expect(audit(root).findings).toEqual([]);
  });
});

describe('this repository', () => {
  it('has no undeclared observability parity gap', () => {
    expect(audit(process.cwd()).findings).toEqual([]);
  });
});
