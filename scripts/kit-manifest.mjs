#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  KIT_PATH,
  MANIFEST_PATH,
  PROFILES_PATH,
  buildManifest,
  runSelf,
  serialiseManifest,
} from './check-kit-parity.mjs';

export function writeManifest(root) {
  const profiles = JSON.parse(readFileSync(join(root, PROFILES_PATH), 'utf8'));
  const manifest = buildManifest(join(root, KIT_PATH), profiles);
  writeFileSync(join(root, MANIFEST_PATH), serialiseManifest(manifest));
  return manifest;
}

function main(argv) {
  const root = process.cwd();
  if (argv.includes('--check')) {
    const result = runSelf(root);
    if (!result.ok) {
      process.stdout.write(`${result.reason}\n`);
      return 1;
    }
    process.stdout.write(`${MANIFEST_PATH} is current (${result.digest.slice(0, 12)})\n`);
    return 0;
  }
  const manifest = writeManifest(root);
  process.stdout.write(
    `wrote ${MANIFEST_PATH} — ${Object.keys(manifest.files).length} files, digest ${manifest.digest}\n`
  );
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
