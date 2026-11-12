#!/usr/bin/env node
/**
 * Copies dependency-free shared modules into the backend.
 *
 * The backend's Docker build context is `./backend`, so it cannot import from
 * `packages/shared` at build time. Rather than restructure the production
 * image build, the handful of pure modules the API needs are vendored: this
 * script is the only writer of `backend/src/services/_shared/vendored/`, and a
 * backend test (`vendored.test.ts`) fails if a copy drifts from its source.
 *
 * Usage:
 *   node packages/shared/scripts/sync-vendored.mjs          # write copies
 *   node packages/shared/scripts/sync-vendored.mjs --check  # exit 1 on drift
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sharedSrc = resolve(here, '../src');
const backendVendored = resolve(here, '../../../backend/src/services/_shared/vendored');

/** Only modules with no imports may be listed here. */
export const VENDORED = [
  { from: 'utils/geo.ts', to: 'geo.ts' },
  { from: 'receipt/receiptParser.ts', to: 'receiptParser.ts' },
];

export const header = (from) =>
  `// GENERATED FILE - DO NOT EDIT.\n` +
  `// Vendored from packages/shared/src/${from} by packages/shared/scripts/sync-vendored.mjs.\n` +
  `// Edit the source and re-run the script.\n\n`;

const normalize = (text) => text.replace(/\r\n/g, '\n');

const check = process.argv.includes('--check');
let drift = false;

for (const { from, to } of VENDORED) {
  const source = normalize(readFileSync(resolve(sharedSrc, from), 'utf8'));
  if (/^\s*import\s/m.test(source)) {
    console.error(`${from} has imports and cannot be vendored as a single file.`);
    process.exit(1);
  }
  const expected = header(from) + source;
  const target = resolve(backendVendored, to);
  if (check) {
    const actual = existsSync(target) ? normalize(readFileSync(target, 'utf8')) : '';
    if (actual !== expected) {
      console.error(`Drift: ${target} does not match packages/shared/src/${from}`);
      drift = true;
    }
  } else {
    mkdirSync(backendVendored, { recursive: true });
    writeFileSync(target, expected, 'utf8');
    console.log(`vendored ${from} -> ${target}`);
  }
}

if (drift) process.exit(1);
