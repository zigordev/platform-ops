#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PATHS = {
  scrapeLocal: 'docker/prometheus/config.local.yml',
  scrapeProd: 'docker/prometheus/config.prod.yml',
  alerts: 'docker/prometheus/alerts.yml',
  lokiRules: 'docker/loki/rules',
  alertmanagerLocal: 'docker/alertmanager/config.local.yml',
  alertmanagerProd: 'docker/alertmanager/config.prod.yml.tpl',
  runbooks: 'docs/runbooks/README.md',
  exceptions: 'docker/observability-parity.json',
  composeLocal: 'docker/compose.ops.local.yml',
  composeProd: 'docker/compose.ops.prod.yml',
  dashboards: 'packages/dashboards/dashboards',
};

const ALERT_NAME = /^\s+-\s+alert:\s*([A-Za-z0-9_]+)\s*$/gm;
const JOB_NAME = /^\s+-\s+job_name:\s*['"]?([A-Za-z0-9_-]+)['"]?\s*$/gm;
const ALERTNAME_MATCHER = /alertname=~?"([^"]*)"/;
const EQUAL_LIST = /equal:\s*\[([^\]]*)\]/;
const APP_SELECTOR = /\bapp(=~|=)"([^"]*)"/g;
const DASHBOARD_UID = /^\s*uid:\s*'service-([a-z0-9-]+)'\s*,\s*$/m;
const EXPR_END = /^\s+(?:for|labels|annotations):/;
const MEM_LIMIT = /^\s+mem_limit:\s*(\S+)\s*$/;
const GO_MEM_LIMIT = /^\s+(?:-\s+)?GOMEMLIMIT[:=]\s*(\S+)\s*$/;
const MEM_DIVISOR =
  /process_resident_memory_bytes\{job="([A-Za-z0-9_-]+)"\}\s*\/\s*(\d+)(?:\s*>\s*([0-9.]+))?/;
const SIZE = /^(\d+)([kmg]?)b?$/i;
const SCALE = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
const GO_SIZE = /^(\d+)(B|KiB|MiB|GiB|TiB)$/;
const GO_SCALE = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 };

function names(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function yamlFilesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...yamlFilesUnder(full));
    else if (entry.endsWith('.yml') || entry.endsWith('.yaml')) out.push(full);
  }
  return out.sort();
}

export function readAlerts(root) {
  const alerts = new Map();
  for (const name of names(readFileSync(join(root, PATHS.alerts), 'utf8'), ALERT_NAME)) {
    alerts.set(name, 'prometheus');
  }
  for (const file of yamlFilesUnder(join(root, PATHS.lokiRules))) {
    for (const name of names(readFileSync(file, 'utf8'), ALERT_NAME)) {
      alerts.set(name, 'loki');
    }
  }
  return alerts;
}

export function declaredLabels(text) {
  const out = new Map();
  const lines = text.split('\n');
  let current = null;
  let inLabels = false;
  let labelIndent = 0;
  for (const line of lines) {
    const alert = /^(\s*)-\s+alert:\s*([A-Za-z0-9_]+)\s*$/.exec(line);
    if (alert) {
      current = alert[2];
      out.set(current, new Set());
      inLabels = false;
      continue;
    }
    if (!current) continue;
    const labels = /^(\s*)labels:\s*$/.exec(line);
    if (labels) {
      inLabels = true;
      labelIndent = labels[1].length;
      continue;
    }
    if (!inLabels) continue;
    const entry = /^(\s*)([A-Za-z0-9_]+):\s*\S/.exec(line);
    if (!entry || entry[1].length <= labelIndent) {
      inLabels = false;
      continue;
    }
    out.get(current).add(entry[2]);
  }
  return out;
}

export function lokiAlertLabels(root) {
  const out = new Map();
  for (const file of yamlFilesUnder(join(root, PATHS.lokiRules))) {
    for (const [name, labels] of declaredLabels(readFileSync(file, 'utf8'))) {
      out.set(name, labels);
    }
  }
  return out;
}

export function logAlertApps(root) {
  const out = new Map();
  for (const file of yamlFilesUnder(join(root, PATHS.lokiRules))) {
    let current = null;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const alert = /^\s*-\s+alert:\s*([A-Za-z0-9_]+)\s*$/.exec(line);
      if (alert) {
        current = alert[1];
        continue;
      }
      if (!current) continue;
      if (EXPR_END.test(line)) {
        current = null;
        continue;
      }
      for (const match of line.matchAll(APP_SELECTOR)) {
        const entry = out.get(current) ?? { listed: new Set(), pinned: new Set() };
        if (match[1] === '=~') for (const app of match[2].split('|')) entry.listed.add(app);
        else entry.pinned.add(match[2]);
        out.set(current, entry);
      }
    }
  }
  return out;
}

export function dashboardServices(root) {
  const dir = join(root, PATHS.dashboards);
  if (!existsSync(dir)) return [];
  const out = new Set();
  for (const entry of readdirSync(dir)) {
    if (!entry.startsWith('service-') || !entry.endsWith('.ts')) continue;
    const uid = DASHBOARD_UID.exec(readFileSync(join(dir, entry), 'utf8'));
    if (uid && uid[1] !== 'overview') out.add(uid[1]);
  }
  return [...out].sort();
}

export function toBytes(value) {
  const match = SIZE.exec(value.trim().replace(/['"]/g, ''));
  if (!match) return null;
  return Number(match[1]) * SCALE[match[2].toLowerCase()];
}

export function toGoBytes(value) {
  const match = GO_SIZE.exec(value.trim().replace(/['"]/g, ''));
  if (!match) return null;
  return Number(match[1]) * GO_SCALE[match[2]];
}

function perService(text, read) {
  const out = new Map();
  let inServices = false;
  let service = null;
  for (const line of text.split('\n')) {
    if (/^[A-Za-z0-9_-]+:/.test(line)) {
      inServices = /^services:\s*$/.test(line);
      service = null;
      continue;
    }
    if (!inServices) continue;
    const head = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (head) {
      service = head[1];
      continue;
    }
    const value = read(line);
    if (value !== undefined && service) out.set(service, value);
  }
  return out;
}

export function memoryCaps(text) {
  return perService(text, (line) => {
    const cap = MEM_LIMIT.exec(line);
    return cap ? toBytes(cap[1]) : undefined;
  });
}

export function goMemoryLimits(text) {
  return perService(text, (line) => {
    const limit = GO_MEM_LIMIT.exec(line);
    if (!limit) return undefined;
    const bytes = toGoBytes(limit[1]);
    return bytes === null ? limit[1].trim().replace(/['"]/g, '') : bytes;
  });
}

export function memoryDivisors(text) {
  const out = [];
  let current = null;
  for (const line of text.split('\n')) {
    const alert = /^\s*-\s+alert:\s*([A-Za-z0-9_]+)\s*$/.exec(line);
    if (alert) {
      current = alert[1];
      continue;
    }
    const divisor = MEM_DIVISOR.exec(line);
    if (divisor && current) {
      out.push({
        alert: current,
        job: divisor[1],
        bytes: Number(divisor[2]),
        fraction: divisor[3] === undefined ? null : Number(divisor[3]),
      });
    }
  }
  return out;
}

export function inhibitBlock(text) {
  const start = text.indexOf('\ninhibit_rules:');
  if (start === -1) return '';
  const rest = text.slice(start + 1);
  const end = rest.search(/\n[a-z_]+:/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

export function parseInhibitRules(block) {
  const chunks = block
    .split(/\n(?=\s{2}- source_matchers:)/)
    .filter((chunk) => chunk.includes('source_matchers:'));
  return chunks.map((chunk, index) => {
    const lines = chunk.split('\n');
    const split = lines.findIndex((line) => line.includes('target_matchers:'));
    const take = (slice) => {
      const line = slice.find((entry) => entry.includes('alertname'));
      if (!line) return [];
      const match = ALERTNAME_MATCHER.exec(line);
      return match ? match[1].split('|') : [];
    };
    const equalMatch = EQUAL_LIST.exec(chunk);
    return {
      index: index + 1,
      source: take(lines.slice(0, split === -1 ? lines.length : split)),
      targets: split === -1 ? [] : take(lines.slice(split)),
      equal: equalMatch
        ? equalMatch[1].split(',').map((entry) => entry.trim().replace(/^'|'$/g, ''))
        : [],
    };
  });
}

export function matches(pattern, name) {
  if (!pattern.endsWith('.*')) return pattern === name;
  return name.startsWith(pattern.slice(0, -2));
}

export function runbookGroups(text) {
  const groups = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || !line.includes('](')) continue;
    const first = line.split('|')[1] ?? '';
    const patterns = [...first.matchAll(/`([A-Za-z0-9_]+\*?)`/g)].map((match) =>
      match[1].endsWith('*') ? `${match[1].slice(0, -1)}.*` : match[1]
    );
    if (patterns.length > 0) groups.push(patterns);
  }
  return groups;
}

function expand(patterns, alertNames) {
  const out = new Set();
  for (const pattern of patterns) {
    for (const name of alertNames) {
      if (matches(pattern, name)) out.add(name);
    }
  }
  return [...out].sort();
}

function allowed(used, exceptions, check, key) {
  const hit = (exceptions[check] ?? []).some((entry) => entry.name === key);
  if (hit) used.add(`${check}/${key}`);
  return hit;
}

export function audit(root) {
  const findings = [];
  const ok = [];
  const used = new Set();
  const exceptions = existsSync(join(root, PATHS.exceptions))
    ? JSON.parse(readFileSync(join(root, PATHS.exceptions), 'utf8'))
    : {};
  const alerts = readAlerts(root);
  const alertNames = [...alerts.keys()].sort();

  const local = names(readFileSync(join(root, PATHS.scrapeLocal), 'utf8'), JOB_NAME);
  const prod = names(readFileSync(join(root, PATHS.scrapeProd), 'utf8'), JOB_NAME);
  let scrapeGaps = 0;
  for (const [a, b, where] of [
    [local, prod, 'prod'],
    [prod, local, 'local'],
  ]) {
    for (const job of a) {
      if (b.includes(job)) continue;
      if (allowed(used, exceptions, 'scrape-parity', job)) continue;
      findings.push(`${job} is scraped but is in no ${where} config`);
      scrapeGaps += 1;
    }
  }
  if (scrapeGaps === 0) ok.push(`${local.length} local and ${prod.length} prod scrape jobs agree`);

  const localBlock = inhibitBlock(readFileSync(join(root, PATHS.alertmanagerLocal), 'utf8'));
  const prodBlock = inhibitBlock(readFileSync(join(root, PATHS.alertmanagerProd), 'utf8'));
  if (localBlock !== prodBlock) findings.push('local and prod inhibit_rules blocks differ');
  else ok.push('one inhibit_rules block in both environments');

  const rules = parseInhibitRules(localBlock);
  let unknown = 0;
  for (const rule of rules) {
    for (const pattern of [...rule.source, ...rule.targets]) {
      if (pattern.endsWith('.*')) {
        if (alertNames.some((name) => matches(pattern, name))) continue;
      } else if (alerts.has(pattern)) continue;
      findings.push(`inhibit rule ${rule.index} matches ${pattern}, which is not a defined alert`);
      unknown += 1;
    }
  }
  if (unknown === 0) ok.push(`${rules.length} inhibit rules name only defined alerts`);

  const logLabels = lokiAlertLabels(root);
  let unmatchable = 0;
  for (const rule of rules) {
    for (const label of rule.equal) {
      if (label === 'environment' || label === 'alertname') continue;
      for (const name of expand(rule.targets, alertNames)) {
        if (alerts.get(name) !== 'loki') continue;
        if (logLabels.get(name)?.has(label)) continue;
        if (allowed(used, exceptions, 'inhibit-labels', name)) continue;
        findings.push(
          `inhibit rule ${rule.index} matches ${name} on ${label}, which its rule does not set`
        );
        unmatchable += 1;
      }
    }
  }
  if (unmatchable === 0) ok.push('every inhibited alert carries the labels its rule compares');

  const services = dashboardServices(root);
  const logApps = logAlertApps(root);
  let strays = 0;
  for (const [name, { listed, pinned }] of logApps) {
    for (const app of [...listed, ...pinned].sort()) {
      if (services.includes(app)) continue;
      if (allowed(used, exceptions, 'log-alert-apps', `${name}:${app}`)) continue;
      findings.push(`${name} watches ${app}, which is not a service in this estate`);
      strays += 1;
    }
    if (listed.size === 0) continue;
    for (const service of services) {
      if (listed.has(service)) continue;
      if (allowed(used, exceptions, 'log-alert-apps', `${name}:${service}`)) continue;
      findings.push(`${name} leaves out ${service}, which has a service dashboard`);
      strays += 1;
    }
  }
  if (strays === 0 && services.length > 0 && logApps.size > 0)
    ok.push(`the log alerts name only the ${services.length} services that have dashboards`);

  const groups = runbookGroups(readFileSync(join(root, PATHS.runbooks), 'utf8'));
  let odd = 0;
  for (const rule of rules) {
    const targets = new Set(expand(rule.targets, alertNames));
    if (targets.size === 0) continue;
    const sources = new Set(expand(rule.source, alertNames));
    for (const group of groups) {
      const members = expand(group, alertNames).filter((name) => !sources.has(name));
      const inside = members.filter((name) => targets.has(name));
      if (inside.length === 0 || inside.length === members.length) continue;
      for (const name of members.filter((entry) => !targets.has(entry))) {
        if (allowed(used, exceptions, 'inhibit-siblings', `${rule.index}:${name}`)) continue;
        findings.push(
          `inhibit rule ${rule.index} covers ${inside.join(', ')} but not its sibling ${name}`
        );
        odd += 1;
      }
    }
  }
  if (odd === 0) ok.push('no alert is left out of a rule that covers its siblings');

  const covered = new Set(groups.flatMap((group) => expand(group, alertNames)));
  let orphans = 0;
  for (const name of alertNames) {
    if (covered.has(name)) continue;
    if (allowed(used, exceptions, 'runbook-rows', name)) continue;
    findings.push(`${name} has no row in ${PATHS.runbooks}`);
    orphans += 1;
  }
  if (orphans === 0) ok.push(`${alertNames.length} alerts each have a runbook row`);

  const composes = [PATHS.composeLocal, PATHS.composeProd].map((path) => {
    const full = join(root, path);
    if (!existsSync(full)) return null;
    const text = readFileSync(full, 'utf8');
    return { caps: memoryCaps(text), soft: goMemoryLimits(text) };
  });
  if (composes.every((entry) => entry !== null)) {
    const [localCaps, prodCaps] = composes.map((entry) => entry.caps);
    const [localSoft, prodSoft] = composes.map((entry) => entry.soft);
    const divisors = memoryDivisors(readFileSync(join(root, PATHS.alerts), 'utf8'));
    let capped = 0;
    let capGaps = 0;
    for (const service of [...new Set([...localCaps.keys(), ...prodCaps.keys()])].sort()) {
      capped += 1;
      const here = localCaps.get(service);
      const there = prodCaps.get(service);
      if (here !== there) {
        findings.push(
          `${service} is capped at ${here ?? 'nothing'} locally and ${there ?? 'nothing'} in prod`
        );
        capGaps += 1;
        continue;
      }
      const watching = divisors.filter((entry) => entry.job === service);
      if (watching.length === 0) {
        if (allowed(used, exceptions, 'memory-caps', service)) continue;
        findings.push(`${service} has a memory limit that no alert watches`);
        capGaps += 1;
        continue;
      }
      const soft = localSoft.get(service);
      const softProd = prodSoft.get(service);
      if (
        soft === undefined &&
        softProd === undefined &&
        !allowed(used, exceptions, 'runtime-memory-limits', service)
      ) {
        findings.push(
          `${service} is capped at ${here} and asks the runtime for nothing, so the kernel kills ` +
            `it instead of the runtime giving memory back`
        );
        capGaps += 1;
      }
      const unreadable = [
        ['locally', soft],
        ['in prod', softProd],
      ].find(([, value]) => typeof value === 'string');
      if (unreadable) {
        findings.push(
          `${service} asks the runtime for ${unreadable[1]} ${unreadable[0]}, ` +
            `which Go does not accept — it takes B, KiB, MiB, GiB or TiB`
        );
        capGaps += 1;
        continue;
      }
      if (soft !== softProd) {
        findings.push(
          `${service} asks the runtime for ${soft ?? 'nothing'} locally and ` +
            `${softProd ?? 'nothing'} in prod`
        );
        capGaps += 1;
        continue;
      }
      if (soft !== undefined && !(soft < here)) {
        findings.push(
          `${service} asks the runtime for ${soft}, which its ${here} memory limit cannot give it`
        );
        capGaps += 1;
        continue;
      }
      for (const entry of watching) {
        if (entry.bytes !== here) {
          findings.push(
            `${entry.alert} divides by ${entry.bytes}, but ${service} is capped at ${here}`
          );
          capGaps += 1;
          continue;
        }
        if (entry.fraction === null) continue;
        const fires = entry.bytes * entry.fraction;
        if (fires >= here) {
          findings.push(
            `${entry.alert} fires at ${Math.round(fires)}, at or above the ${here} ceiling it is meant to warn about`
          );
          capGaps += 1;
          continue;
        }
        if (soft !== undefined && fires <= soft) {
          findings.push(
            `${entry.alert} fires at ${Math.round(fires)}, at or below the ${soft} ${service} is allowed to use`
          );
          capGaps += 1;
        }
      }
    }
    if (capGaps === 0 && capped > 0) {
      const subject = capped === 1 ? '1 memory limit agrees' : `${capped} memory limits agree`;
      ok.push(`${subject} across environments, with any runtime limit and alert inside it`);
    }
  }

  let dead = 0;
  let declared = 0;
  for (const [check, entries] of Object.entries(exceptions)) {
    for (const entry of entries) {
      declared += 1;
      if (!entry.reason) {
        findings.push(`exception ${check}/${entry.name} has no reason`);
        dead += 1;
      } else if (!used.has(`${check}/${entry.name}`)) {
        findings.push(`exception ${check}/${entry.name} suppresses nothing — remove it`);
        dead += 1;
      }
    }
  }
  if (dead === 0 && declared > 0)
    ok.push(`${declared} declared exceptions each have a reason and still apply`);

  return { findings, ok };
}

function main() {
  const root = process.cwd();
  const { findings, ok } = audit(root);
  for (const line of ok) process.stdout.write(`  ok    ${line}\n`);
  for (const line of findings) process.stdout.write(`  FAIL  ${line}\n`);
  return findings.length > 0 ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main();
}
