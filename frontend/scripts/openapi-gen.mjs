#!/usr/bin/env node
/* eslint-disable no-console */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const source =
  process.env.OPENAPI_SOURCE ||
  resolve(root, '..', 'backend', 'openapi.json');

const out = resolve(root, 'src', 'lib', 'api', 'schema.ts');

async function loadSource() {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`OpenAPI fetch failed: ${res.status} ${res.statusText}`);
    return await res.text();
  }
  if (!existsSync(source)) {
    // Fall back to the bundled local copy if neither remote nor sibling repo is reachable.
    const local = resolve(root, 'openapi.json');
    if (!existsSync(local)) {
      throw new Error(`OpenAPI source not found at ${source} and no local fallback openapi.json present.`);
    }
    return readFileSync(local, 'utf8');
  }
  return readFileSync(source, 'utf8');
}

async function main() {
  console.log(`[openapi-gen] source: ${source}`);
  const json = await loadSource();

  const stagedDir = resolve(root, '.openapi-cache');
  if (!existsSync(stagedDir)) mkdirSync(stagedDir, { recursive: true });
  const staged = resolve(stagedDir, 'openapi.json');
  writeFileSync(staged, json, 'utf8');

  const cmd = `npx --no-install openapi-typescript "${staged}" -o "${out}"`;
  console.log(`[openapi-gen] running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
  console.log(`[openapi-gen] wrote ${out}`);
}

main().catch((err) => {
  console.error('[openapi-gen] failed:', err);
  process.exit(1);
});
