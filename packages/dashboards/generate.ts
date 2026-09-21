import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

import { DASHBOARDS } from './dashboards/index.ts';
import { build } from './lib/dashboard.ts';
import { FOLDERS } from './lib/folders.ts';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const TARGET = join(ROOT, 'docker/grafana/provisioning/dashboards');
export const MOUNT = '/etc/grafana/provisioning/dashboards';
export const PROVIDERS_FILE = 'dashboards.yml';

export function providers(): string {
  const lines = ['apiVersion: 1', '', 'providers:'];
  for (const folder of FOLDERS) {
    lines.push(
      `  - name: ${folder.uid}`,
      '    orgId: 1',
      `    folder: ${folder.name}`,
      `    folderUid: ${folder.uid}`,
      '    type: file',
      '    disableDeletion: false',
      '    allowUiUpdates: false',
      '    updateIntervalSeconds: 30',
      '    options:',
      `      path: ${MOUNT}/${folder.uid}`
    );
  }
  return `${lines.join('\n')}\n`;
}

export async function render(): Promise<Map<string, string>> {
  const config = (await prettier.resolveConfig(join(TARGET, PROVIDERS_FILE))) ?? {};
  const files = new Map<string, string>();
  for (const spec of DASHBOARDS) {
    const json = JSON.stringify(build(spec));
    files.set(join(spec.folder.uid, `${spec.uid}.json`), await prettier.format(json, { ...config, parser: 'json' }));
  }
  files.set(PROVIDERS_FILE, await prettier.format(providers(), { ...config, parser: 'yaml' }));
  return files;
}

export async function onDisk(): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && depth === 0) await walk(path, 1);
      else if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.yml'))) found.push(relative(TARGET, path));
    }
  };
  await walk(TARGET, 0);
  return found.sort();
}

export async function write(): Promise<string[]> {
  const files = await render();
  for (const stale of (await onDisk()).filter((path) => !files.has(path))) {
    await rm(join(TARGET, stale));
  }
  for (const [path, content] of files) {
    await mkdir(dirname(join(TARGET, path)), { recursive: true });
    await writeFile(join(TARGET, path), content);
  }
  return [...files.keys()].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const written = await write();
  process.stdout.write(`Wrote ${written.length} files under ${relative(ROOT, TARGET)}\n`);
}
