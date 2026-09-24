import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  audit,
  declaredProduction,
  hasReasonedException,
  installedPackages,
  isPermissive,
  licenceOf,
  report,
  workspaceDirs,
} from './check-licences.mjs';

let root;

function writeJson(relative, value) {
  const path = join(root, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function installed(entries) {
  return new Map(entries.map(([spec, name]) => [spec, { name, path: null }]));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'licences-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('isPermissive', () => {
  it('accepts a dual licence when either half is allowed', () => {
    expect(isPermissive('(MIT OR Apache-2.0)')).toBe(true);
    expect(isPermissive('(LGPL-3.0 OR MIT)')).toBe(true);
  });

  it('rejects a licence that is on no list', () => {
    expect(isPermissive('GPL-3.0-only')).toBe(false);
    expect(isPermissive('SEE LICENSE IN LICENCE.txt')).toBe(false);
  });
});

describe('hasReasonedException', () => {
  it('covers the named package and its platform builds', () => {
    expect(hasReasonedException('@img/sharp-libvips')).toBe(true);
    expect(hasReasonedException('@img/sharp-libvips-darwin-arm64')).toBe(true);
    expect(hasReasonedException('@img/sharp-darwin-arm64')).toBe(false);
  });
});

describe('installedPackages', () => {
  it('walks the whole tree, deduplicates and leaves workspace packages out', () => {
    const tree = {
      dependencies: {
        '@app/web': { version: '1.0.0', resolved: 'file:apps/web', dependencies: {} },
        left: {
          version: '2.0.0',
          resolved: 'https://registry/left',
          dependencies: { shared: { version: '3.0.0', resolved: 'https://registry/shared' } },
        },
        right: {
          version: '2.0.0',
          resolved: 'https://registry/right',
          dependencies: { shared: { version: '3.0.0', resolved: 'https://registry/shared' } },
        },
      },
    };
    expect([...installedPackages(tree).keys()].sort()).toEqual([
      'left@2.0.0',
      'right@2.0.0',
      'shared@3.0.0',
    ]);
  });
});

describe('declaredProduction', () => {
  it('reads the root and every workspace, and skips local and sibling specs', () => {
    writeJson('package.json', {
      name: 'estate',
      workspaces: ['apps/*'],
      dependencies: { hoisted: '^1.0.0' },
      devDependencies: { vitest: '^5.0.0' },
    });
    writeJson('apps/web/package.json', {
      name: '@estate/web',
      dependencies: { react: '^19.0.0', '@estate/api': 'file:../api', tool: 'workspace:*' },
    });
    writeJson('apps/api/package.json', {
      name: '@estate/api',
      dependencies: { fastify: '^5.0.0', '@estate/web': '*' },
    });

    const dirs = workspaceDirs(root);
    expect(dirs.sort()).toEqual(['apps/api', 'apps/web']);
    expect([...declaredProduction(root, dirs)].sort()).toEqual(['fastify', 'hoisted', 'react']);
  });
});

describe('licenceOf', () => {
  it('reads the licence of a package hoisted at the root', () => {
    writeJson('package.json', { name: 'estate' });
    writeJson('node_modules/left/package.json', { name: 'left', license: 'MIT' });
    expect(licenceOf(root, [], 'left')).toBe('MIT');
  });

  it('falls back to a workspace copy, and to null when there is none', () => {
    writeJson('package.json', { name: 'estate', workspaces: ['apps/*'] });
    writeJson('apps/web/package.json', { name: '@estate/web' });
    writeJson('apps/web/node_modules/nested/package.json', {
      name: 'nested',
      licenses: [{ type: 'ISC' }],
    });
    const dirs = workspaceDirs(root);
    expect(licenceOf(root, dirs, 'nested')).toBe('ISC');
    expect(licenceOf(root, dirs, 'absent')).toBe(null);
  });
});

describe('audit', () => {
  const licences = { left: 'MIT', right: 'GPL-3.0-only', argparse: 'Python-2.0' };

  it('counts what it read, sets aside what it skipped and names the offender', () => {
    const result = audit({
      declared: new Set(['left', 'right']),
      installed: installed([
        ['left@1.0.0', 'left'],
        ['right@1.0.0', 'right'],
        ['argparse@2.0.0', 'argparse'],
        ['gone@1.0.0', 'gone'],
      ]),
      licenceFor: (name) => licences[name] ?? null,
    });
    expect(result).toMatchObject({
      checked: 2,
      exempted: 1,
      unreadable: 1,
      missing: [],
      offenders: ['right@1.0.0 — GPL-3.0-only'],
    });
  });

  it('reports a declared dependency that is not in the installed tree', () => {
    const result = audit({
      declared: new Set(['left', 'right']),
      installed: installed([['left@1.0.0', 'left']]),
      licenceFor: () => 'MIT',
    });
    expect(result.missing).toEqual(['right']);
  });
});

describe('report', () => {
  const clean = { offenders: [], checked: 4, exempted: 0, unreadable: 0, missing: [] };

  it('fails when dependencies are declared and the tree is empty', () => {
    const { code, err } = report({ ...clean, declared: 12, installed: 0, checked: 0 });
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('inspected nothing');
  });

  it('fails when the tree holds packages and none had a readable licence', () => {
    const { code, err } = report({
      ...clean,
      declared: 12,
      installed: 40,
      checked: 0,
      unreadable: 40,
    });
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('not one had a readable licence');
  });

  it('fails on a partial tree even when everything it did read is permissive', () => {
    const { code, err } = report({
      ...clean,
      declared: 12,
      installed: 40,
      missing: ['fastify', 'react'],
    });
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('fastify');
  });

  it('fails on an offender', () => {
    const { code, err } = report({
      ...clean,
      declared: 12,
      installed: 40,
      offenders: ['right@1.0.0 — GPL-3.0-only'],
    });
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('GPL-3.0-only');
  });

  it('passes a repository that declares no production dependencies, and says so', () => {
    const { code, out } = report({ ...clean, declared: 0, installed: 0, checked: 0 });
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('no production dependencies');
  });

  it('passes a real tree, reporting what it read and what it set aside', () => {
    const { code, out } = report({
      ...clean,
      declared: 18,
      installed: 258,
      checked: 255,
      exempted: 2,
      unreadable: 1,
    });
    expect(code).toBe(0);
    expect(out[0]).toBe(
      'Licence check passed: 255 of 258 production packages, all permissive ' +
        '(2 allow-listed by name, 1 with no manifest to read).'
    );
  });
});
