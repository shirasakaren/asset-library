import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

const root = path.resolve(__dirname, '../../..');
const committedPath = path.resolve(root, '..', 'THIRD_PARTY_NOTICES.md');
// git may check files out with CRLF on Windows
const norm = (s: string) => s.replace(/\r\n/g, '\n');

describe('THIRD_PARTY_NOTICES.md', () => {
  it('is up to date with assets.yaml and the thumbnail manifest (run pnpm seed:notices)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notices-'));
    try {
      const out = path.join(tmp, 'THIRD_PARTY_NOTICES.md');
      const tsx = path.join(root, 'node_modules/tsx/dist/cli.mjs');
      const script = path.join(root, 'scripts/seed/notices.ts');
      execFileSync(process.execPath, [tsx, script, '--out', out], { cwd: root, stdio: 'pipe' });
      const again = path.join(tmp, 'again.md');
      execFileSync(process.execPath, [tsx, script, '--out', again], { cwd: root, stdio: 'pipe' });
      expect(fs.readFileSync(out).equals(fs.readFileSync(again)), 'deterministic').toBe(true);
      expect(
        norm(fs.readFileSync(committedPath, 'utf8')) === norm(fs.readFileSync(out, 'utf8')),
        'THIRD_PARTY_NOTICES.md is stale: run pnpm seed:notices',
      ).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it('states the third-party status, the takedown contact, the fonts and lists every listing once', () => {
    const text = norm(fs.readFileSync(committedPath, 'utf8'));
    expect(text).toMatch(/third-party material owned by their respective creators and stores/);
    expect(text).toMatch(/not\*\* covered by this repository's license/);
    expect(text).toContain('it@labmgm.org');
    for (const font of ['Bricolage Grotesque', 'Geist Mono', 'SIL Open Font License 1.1']) {
      expect(text).toContain(font);
    }
    const entries = parse(fs.readFileSync(path.join(root, 'scripts/seed/assets.yaml'), 'utf8')) as {
      title: string;
      url: string;
    }[];
    for (const e of entries) {
      expect(text, e.title).toContain(`<${e.url}>`);
    }
    const rows = text
      .split('\n')
      .filter((l) => l.startsWith('| ') && !l.startsWith('| Title') && !l.startsWith('| ---'));
    expect(rows).toHaveLength(entries.length);
  });
});
