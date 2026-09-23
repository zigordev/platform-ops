import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SCHEMA,
  buildManifest,
  checkCopies,
  compareToLive,
  describeFinding,
  fetchLiveManifest,
  main,
  manifestDigest,
  profileClosure,
  serialiseManifest,
  stripJsImportExtensions,
  validateConfig,
} from './check-kit-parity.mjs';
import { runSelf } from './check-kit-parity.mjs';
import { writeManifest } from './kit-manifest.mjs';

const KIT_FILES = {
  'json-logger.ts': 'export const log = () => {};\n',
  'metrics.registry.ts': "export const registry = 'plain';\n",
  'metrics.registry.openmetrics.ts': "export const registry = 'openmetrics';\n",
  'tracing.ts': "import { log } from './json-logger';\nexport const trace = log;\n",
  'next.ts': "import { registry } from './metrics.registry';\nexport default registry;\n",
};

const PROFILES = {
  fastify: { kit: ['json-logger.ts', 'metrics.registry.ts', 'tracing.ts'] },
  next: {
    kit: ['json-logger.ts', 'metrics.registry.openmetrics.ts', 'next.ts', 'tracing.ts'],
    local: ['metrics.registry.ts'],
  },
};

let root;
let kitDir;
let manifest;

function makeKit() {
  kitDir = join(root, 'packages', 'observability');
  mkdirSync(kitDir, { recursive: true });
  for (const [name, body] of Object.entries(KIT_FILES)) {
    writeFileSync(join(kitDir, name), body);
  }
  writeFileSync(join(kitDir, 'README.md'), '# kit\n');
  writeFileSync(join(kitDir, 'kit.profiles.json'), `${JSON.stringify(PROFILES, null, 2)}\n`);
  return buildManifest(kitDir, PROFILES);
}

function vendor(copyPath, names, transform = (text) => text) {
  const dir = join(root, copyPath);
  mkdirSync(dir, { recursive: true });
  for (const name of names) {
    writeFileSync(join(dir, name), transform(KIT_FILES[name], name));
  }
  return dir;
}

function config(overrides = {}) {
  return {
    schema: SCHEMA,
    kit: { repo: 'zigordev/platform-ops', ref: 'main' },
    pinned: { digest: manifest.digest, files: manifest.files, profiles: manifest.profiles },
    copies: [{ path: 'apps/api/src/observability', profile: 'fastify' }],
    deviations: [],
    ...overrides,
  };
}

function kinds(findings) {
  return findings.map((finding) => `${finding.kind}:${finding.file ?? finding.id ?? ''}`).sort();
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kit-parity-'));
  manifest = makeKit();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('manifest', () => {
  it('hashes every kit source and leaves prose out', () => {
    expect(Object.keys(manifest.files).sort()).toEqual(Object.keys(KIT_FILES).sort());
  });

  it('gives the same digest whatever order the keys arrive in', () => {
    const reversed = {
      files: Object.fromEntries(Object.entries(manifest.files).reverse()),
      profiles: {
        next: { kit: [...PROFILES.next.kit].reverse(), local: [...PROFILES.next.local] },
        fastify: { kit: [...PROFILES.fastify.kit].reverse() },
      },
    };
    expect(manifestDigest(reversed)).toBe(manifest.digest);
  });

  it('changes when a single kit byte changes', () => {
    writeFileSync(join(kitDir, 'tracing.ts'), `${KIT_FILES['tracing.ts']}\n`);
    expect(buildManifest(kitDir, PROFILES).digest).not.toBe(manifest.digest);
  });

  it('changes when a profile gains a file', () => {
    const widened = { ...PROFILES, fastify: { kit: [...PROFILES.fastify.kit, 'next.ts'] } };
    expect(buildManifest(kitDir, widened).digest).not.toBe(manifest.digest);
  });

  it('serialises the way prettier formats json', () => {
    const text = serialiseManifest(manifest);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  });

  it('round-trips through the generator', () => {
    const written = writeManifest(root);
    expect(written.digest).toBe(manifest.digest);
    const onDisk = readFileSync(join(kitDir, 'kit.manifest.json'), 'utf8');
    expect(JSON.parse(onDisk).digest).toBe(manifest.digest);
  });
});

describe('profiles', () => {
  it('passes when every profile carries what its files import', () => {
    expect(profileClosure(kitDir, PROFILES)).toEqual([]);
  });

  it('catches a profile that carries a file but not what it imports', () => {
    const broken = { fastify: { kit: ['tracing.ts'] } };
    expect(profileClosure(kitDir, broken)).toEqual([
      'fastify carries tracing.ts, which imports json-logger.ts, which it does not carry',
    ]);
  });

  it('accepts an import satisfied by a file the app provides', () => {
    const provided = { fastify: { kit: ['tracing.ts'], local: ['json-logger.ts'] } };
    expect(profileClosure(kitDir, provided)).toEqual([]);
  });

  it('catches a profile requiring a file the kit does not have', () => {
    const broken = { fastify: { kit: ['gone.ts'] } };
    expect(profileClosure(kitDir, broken)).toEqual([
      'fastify requires gone.ts, which the kit does not have',
    ]);
  });

  it('fails the self check when a profile is not self-contained', () => {
    writeFileSync(
      join(kitDir, 'kit.profiles.json'),
      `${JSON.stringify({ fastify: { kit: ['tracing.ts'] } }, null, 2)}\n`
    );
    writeManifest(root);
    const result = runSelf(root);
    expect(result.ok).toBe(false);
    expect(result.gaps).toHaveLength(1);
  });
});

describe('js import extensions', () => {
  it('strips the extension a nodenext relative import needs', () => {
    expect(stripJsImportExtensions("import { a } from './b.js';")).toBe("import { a } from './b';");
    expect(stripJsImportExtensions('export { a } from "../c/d.js";')).toBe(
      'export { a } from "../c/d";'
    );
  });

  it('leaves bare and package specifiers alone', () => {
    const untouched = [
      "import { readFileSync } from 'node:fs';",
      "import x from 'some-package/dist/index.js';",
      "const path = './not-an-import.js';",
    ];
    for (const line of untouched) {
      expect(stripJsImportExtensions(line)).toBe(line);
    }
  });
});

describe('vendored copies', () => {
  it('passes a verbatim copy', () => {
    vendor('apps/api/src/observability', PROFILES.fastify.kit);
    expect(checkCopies(root, config())).toEqual([]);
  });

  it('catches an edited copy', () => {
    vendor('apps/api/src/observability', PROFILES.fastify.kit, (text, name) =>
      name === 'tracing.ts' ? `${text}export const extra = 1;\n` : text
    );
    expect(kinds(checkCopies(root, config()))).toEqual(['drift:tracing.ts']);
  });

  it('catches a copy that is missing a file the profile requires', () => {
    vendor('apps/api/src/observability', ['json-logger.ts', 'metrics.registry.ts']);
    expect(kinds(checkCopies(root, config()))).toEqual(['missing:tracing.ts']);
  });

  it('reports a copy directory that does not exist', () => {
    expect(kinds(checkCopies(root, config()))).toEqual(['missing-copy:']);
  });

  it('tolerates declared nodenext import extensions', () => {
    vendor('apps/api/src/observability', PROFILES.fastify.kit, (text) =>
      text.replace("from './json-logger'", "from './json-logger.js'")
    );
    const declared = config({
      deviations: [
        {
          id: 'nodenext',
          copy: 'apps/api/src/observability',
          rule: 'js-import-extension',
          reason: 'the control-plane compiles as nodenext esm',
          files: ['tracing.ts'],
        },
      ],
    });
    expect(checkCopies(root, declared)).toEqual([]);
  });

  it('fails the same copy when the deviation is not declared', () => {
    vendor('apps/api/src/observability', PROFILES.fastify.kit, (text) =>
      text.replace("from './json-logger'", "from './json-logger.js'")
    );
    expect(kinds(checkCopies(root, config()))).toEqual(['drift:tracing.ts']);
  });

  it('leaves a next app to provide its own registry re-export', () => {
    vendor('apps/web/src/observability', [
      'json-logger.ts',
      'next.ts',
      'tracing.ts',
      'metrics.registry.openmetrics.ts',
    ]);
    writeFileSync(
      join(root, 'apps/web/src/observability/metrics.registry.ts'),
      "export { registry } from './metrics.registry.openmetrics';\n"
    );
    const declared = config({
      copies: [{ path: 'apps/web/src/observability', profile: 'next' }],
    });
    expect(checkCopies(root, declared)).toEqual([]);
  });

  it('still requires the openmetrics file a next app is built on', () => {
    vendor('apps/web/src/observability', ['json-logger.ts', 'next.ts', 'tracing.ts']);
    writeFileSync(
      join(root, 'apps/web/src/observability/metrics.registry.ts'),
      KIT_FILES['metrics.registry.openmetrics.ts']
    );
    const declared = config({
      copies: [{ path: 'apps/web/src/observability', profile: 'next' }],
    });
    expect(kinds(checkCopies(root, declared))).toEqual(['missing:metrics.registry.openmetrics.ts']);
  });

  it('compares a differently named copy against the kit file it aliases', () => {
    vendor('apps/api/src/observability', ['json-logger.ts', 'tracing.ts']);
    writeFileSync(
      join(root, 'apps/api/src/observability/registry.ts'),
      KIT_FILES['metrics.registry.ts']
    );
    const declared = config({
      deviations: [
        {
          id: 'registry-name',
          copy: 'apps/api/src/observability',
          rule: 'alias',
          file: 'registry.ts',
          kitFile: 'metrics.registry.ts',
          reason: 'this service named the file registry.ts before the kit existed',
        },
      ],
    });
    expect(checkCopies(root, declared)).toEqual([]);
  });

  it('flags a deviation that is no longer needed', () => {
    vendor('apps/api/src/observability', PROFILES.fastify.kit);
    const declared = config({
      deviations: [
        {
          id: 'nodenext',
          copy: 'apps/api/src/observability',
          rule: 'js-import-extension',
          reason: 'stated once, true no longer',
          files: ['tracing.ts'],
        },
      ],
    });
    expect(kinds(checkCopies(root, declared))).toEqual(['stale-deviation:tracing.ts']);
  });

  it('flags a deviation that matches no vendored file', () => {
    vendor('apps/api/src/observability', PROFILES.fastify.kit);
    const declared = config({
      deviations: [
        {
          id: 'ghost',
          copy: 'apps/api/src/observability',
          rule: 'exempt',
          file: 'gone.ts',
          reason: 'names a file that is not there',
        },
      ],
    });
    expect(kinds(checkCopies(root, declared))).toEqual(['unused-deviation:ghost']);
  });

  it('honours an exemption and still says it is there', () => {
    vendor('apps/api/src/observability', PROFILES.fastify.kit, (text, name) =>
      name === 'tracing.ts' ? `${text}export const fork = 1;\n` : text
    );
    const declared = config({
      deviations: [
        {
          id: 'tracing-fork',
          copy: 'apps/api/src/observability',
          rule: 'exempt',
          file: 'tracing.ts',
          reason: 'forked while the sampler lands upstream',
          expires: '2099-01-01',
        },
      ],
    });
    const findings = checkCopies(root, declared);
    expect(kinds(findings)).toEqual(['exempt:tracing.ts']);
    expect(findings.every((finding) => finding.level === 'notice')).toBe(true);
  });

  it('fails an exemption that has expired', () => {
    vendor('apps/api/src/observability', PROFILES.fastify.kit, (text, name) =>
      name === 'tracing.ts' ? `${text}export const fork = 1;\n` : text
    );
    const declared = config({
      deviations: [
        {
          id: 'tracing-fork',
          copy: 'apps/api/src/observability',
          rule: 'exempt',
          file: 'tracing.ts',
          reason: 'forked while the sampler lands upstream',
          expires: '2020-01-01',
        },
      ],
    });
    const findings = checkCopies(root, declared);
    expect(kinds(findings)).toEqual(['expired-exemption:tracing.ts']);
    expect(findings[0].level).toBe('error');
  });

  it('ignores files the kit does not have', () => {
    vendor('apps/api/src/observability', PROFILES.fastify.kit);
    writeFileSync(join(root, 'apps/api/src/observability/index.ts'), 'export {};\n');
    expect(checkCopies(root, config())).toEqual([]);
  });
});

describe('config validation', () => {
  it('accepts a well formed config', () => {
    expect(validateConfig(config())).toEqual([]);
  });

  it('rejects an unknown rule and a reasonless deviation', () => {
    const problems = validateConfig(
      config({ deviations: [{ id: 'x', copy: 'a', rule: 'whatever', file: 'b.ts' }] })
    );
    expect(problems).toHaveLength(2);
    expect(problems.join(' ')).toContain('unknown rule whatever');
    expect(problems.join(' ')).toContain('no reason');
  });

  it('rejects a copy naming a profile the pin does not define', () => {
    const problems = validateConfig(config({ copies: [{ path: 'a', profile: 'django' }] }));
    expect(problems).toEqual(['copy a names unknown profile django']);
  });

  it('rejects a hash edited into the pin without the digest following it', () => {
    const doctored = config();
    doctored.pinned.files['json-logger.ts'] = 'a'.repeat(64);
    const problems = validateConfig(doctored);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('does not describe pinned.files and pinned.profiles');
  });

  it('rejects a profile edited into the pin without the digest following it', () => {
    const doctored = config();
    doctored.pinned.profiles.fastify.kit = ['json-logger.ts'];
    expect(validateConfig(doctored).join(' ')).toContain('run --repin');
  });

  it('says nothing about the digest when it is missing', () => {
    const problems = validateConfig(config({ pinned: { files: {}, profiles: {} } }));
    expect(problems).toContain('pinned.digest is missing');
    expect(problems.join(' ')).not.toContain('run --repin');
  });

  it('rejects an alias with no kit file and a wrong schema', () => {
    const problems = validateConfig(
      config({
        schema: 99,
        deviations: [{ id: 'x', copy: 'a', rule: 'alias', file: 'b.ts', reason: 'because' }],
      })
    );
    expect(problems.join(' ')).toContain('schema is 99');
    expect(problems.join(' ')).toContain('has no kitFile');
  });
});

describe('the live kit', () => {
  it('says current when the digests agree', () => {
    expect(compareToLive(config(), { url: 'u', manifest }).kind).toBe('current');
  });

  it('names the files that moved and the files that are new', () => {
    const moved = structuredClone(manifest);
    moved.files['tracing.ts'] = 'f'.repeat(64);
    moved.files['route-names.ts'] = 'a'.repeat(64);
    moved.digest = manifestDigest(moved);
    const verdict = compareToLive(config(), { url: 'u', manifest: moved });
    expect(verdict.kind).toBe('behind');
    expect(verdict.behind).toEqual(['tracing.ts']);
    expect(verdict.added).toEqual(['route-names.ts']);
    expect(verdict.level).toBe('notice');
  });

  it('treats an unreadable manifest as unreachable, never as drift', () => {
    expect(compareToLive(config(), { url: 'u', error: 'getaddrinfo ENOTFOUND' }).kind).toBe(
      'unreachable'
    );
    expect(compareToLive(config(), { url: 'u', manifest: {} }).kind).toBe('unreachable');
  });

  it('reports an http failure rather than throwing', async () => {
    const result = await fetchLiveManifest(config(), {
      fetchImpl: async () => ({ ok: false, status: 404 }),
    });
    expect(result.error).toBe('HTTP 404');
  });

  it('reports a network failure rather than throwing', async () => {
    const result = await fetchLiveManifest(config(), {
      fetchImpl: async () => {
        throw new Error('socket hang up');
      },
    });
    expect(result.error).toBe('socket hang up');
  });

  it('reads the manifest from the configured repository and ref', async () => {
    let seen;
    const result = await fetchLiveManifest(config(), {
      fetchImpl: async (url) => {
        seen = url;
        return { ok: true, json: async () => manifest };
      },
    });
    expect(seen).toBe(
      'https://raw.githubusercontent.com/zigordev/platform-ops/main/packages/observability/kit.manifest.json'
    );
    expect(result.manifest.digest).toBe(manifest.digest);
  });
});

describe('the kit against its own manifest', () => {
  it('passes once the manifest has been written', () => {
    writeManifest(root);
    const result = runSelf(root);
    expect(result.ok).toBe(true);
    expect(result.digest).toBe(manifest.digest);
    expect(result.count).toBe(Object.keys(KIT_FILES).length);
  });

  it('says which files moved when the manifest was not regenerated', () => {
    writeManifest(root);
    writeFileSync(join(kitDir, 'tracing.ts'), `${KIT_FILES['tracing.ts']}// moved\n`);
    const result = runSelf(root);
    expect(result.ok).toBe(false);
    expect(result.changed).toEqual(['tracing.ts']);
  });

  it('says which files went away', () => {
    writeManifest(root);
    rmSync(join(kitDir, 'next.ts'));
    const result = runSelf(root);
    expect(result.ok).toBe(false);
    expect(result.removed).toEqual(['next.ts']);
  });

  it('names a kit file that belongs to no profile', () => {
    writeFileSync(join(kitDir, 'orphan.ts'), 'export const orphan = 1;\n');
    writeManifest(root);
    expect(runSelf(root).unprofiled).toEqual(['orphan.ts']);
  });

  it('asks for the manifest when there is none', () => {
    expect(runSelf(root).ok).toBe(false);
    expect(runSelf(root).reason).toContain('does not exist');
  });
});

describe('what a finding reads as', () => {
  it('has a sentence for every kind it emits', () => {
    const samples = [
      { kind: 'missing-copy', copy: 'apps/api/src/observability' },
      { kind: 'missing', copy: 'apps/api/src/observability', file: 'tracing.ts' },
      { kind: 'drift', copy: 'a', file: 'b.ts', kitFile: 'b.ts' },
      { kind: 'expired-exemption', copy: 'a', file: 'b.ts', id: 'x', expires: '2020-01-01' },
      { kind: 'exempt', copy: 'a', file: 'b.ts', id: 'x' },
      { kind: 'stale-deviation', copy: 'a', file: 'b.ts', id: 'x' },
      { kind: 'unused-deviation', id: 'x' },
    ];
    for (const sample of samples) {
      const line = describeFinding(sample);
      expect(line).not.toContain('{');
      expect(line.length).toBeGreaterThan(10);
    }
    expect(describeFinding({ kind: 'unheard-of' })).toContain('unheard-of');
  });
});

describe('the command line', () => {
  let written;
  let restore;

  beforeEach(() => {
    written = '';
    restore = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => {
      written += chunk;
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = restore;
  });

  function withConfig(overrides) {
    vendor('apps/api/src/observability', PROFILES.fastify.kit);
    writeFileSync(
      join(root, 'observability.kit.json'),
      `${JSON.stringify(config(overrides), null, 2)}\n`
    );
  }

  function movedOn() {
    const moved = structuredClone(manifest);
    moved.files['tracing.ts'] = 'f'.repeat(64);
    moved.digest = manifestDigest(moved);
    return moved;
  }

  it('passes offline on a clean copy and never reaches the network', async () => {
    withConfig();
    let called = false;
    const code = await main(['--offline'], {
      root,
      fetchImpl: async () => {
        called = true;
        return { ok: true, json: async () => manifest };
      },
    });
    expect(code).toBe(0);
    expect(called).toBe(false);
    expect(written).toContain('vendored kit matches the pin');
  });

  it('reports being behind without failing', async () => {
    withConfig();
    const code = await main([], {
      root,
      fetchImpl: async () => ({ ok: true, json: async () => movedOn() }),
    });
    expect(code).toBe(0);
    expect(written).toContain('behind the kit: 1 changed, 0 added');
  });

  it('fails on being behind only under strict-remote', async () => {
    withConfig();
    const code = await main(['--strict-remote'], {
      root,
      fetchImpl: async () => ({ ok: true, json: async () => movedOn() }),
    });
    expect(code).toBe(1);
  });

  it('never fails on an unreachable kit, even under strict-remote', async () => {
    withConfig();
    const code = await main(['--strict-remote'], {
      root,
      fetchImpl: async () => {
        throw new Error('socket hang up');
      },
    });
    expect(code).toBe(0);
    expect(written).toContain('could not read the live kit manifest');
  });

  it('fails on an edit whatever the network says', async () => {
    withConfig();
    writeFileSync(join(root, 'apps/api/src/observability/tracing.ts'), 'export const gone = 1;\n');
    const code = await main([], {
      root,
      fetchImpl: async () => ({ ok: true, json: async () => manifest }),
    });
    expect(code).toBe(1);
    expect(written).toContain("differs from the kit's tracing.ts");
  });

  it('repins from the live manifest', async () => {
    withConfig();
    const moved = movedOn();
    const code = await main(['--repin'], {
      root,
      fetchImpl: async () => ({ ok: true, json: async () => moved }),
    });
    expect(code).toBe(0);
    const repinned = JSON.parse(readFileSync(join(root, 'observability.kit.json'), 'utf8'));
    expect(repinned.pinned.digest).toBe(moved.digest);
    expect(repinned.pinned.files).toEqual(moved.files);
    expect(repinned.copies).toHaveLength(1);
  });

  it('refuses a config it cannot use', async () => {
    withConfig({ copies: [{ path: 'apps/api/src/observability', profile: 'django' }] });
    expect(await main(['--offline'], { root })).toBe(1);
    expect(written).toContain('unknown profile django');
  });

  it('says so when there is no config at all', async () => {
    expect(await main(['--offline'], { root })).toBe(1);
    expect(written).toContain('not found in');
  });

  it('checks the kit against its own manifest under --self', async () => {
    writeManifest(root);
    expect(await main(['--self'], { root })).toBe(0);
    expect(written).toContain('kit manifest current');
  });

  it('fails --self when the manifest was not regenerated', async () => {
    writeManifest(root);
    writeFileSync(join(kitDir, 'tracing.ts'), 'export const moved = 1;\n');
    expect(await main(['--self'], { root })).toBe(1);
    expect(written).toContain('changed: tracing.ts');
  });
});
