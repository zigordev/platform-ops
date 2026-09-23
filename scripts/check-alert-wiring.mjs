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
};

const ALERT_NAME = /^\s+-\s+alert:\s*([A-Za-z0-9_]+)\s*$/gm;
const JOB_NAME = /^\s+-\s+job_name:\s*['"]?([A-Za-z0-9_-]+)['"]?\s*$/gm;
const ALERTNAME_MATCHER = /alertname=~?"([^"]*)"/;
const EQUAL_LIST = /equal:\s*\[([^\]]*)\]/;

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
