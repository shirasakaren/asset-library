// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkNoindex } from '../../scripts/check-noindex.mjs';

let root: string;
const write = (rel: string, html: string) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
};

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'noindex-'));
  write('index.html', '<head><meta name="robots" content="noindex, nofollow"/></head>');
  write(
    '404.html',
    '<meta name="robots" content="noindex"/><meta name="robots" content="noindex, nofollow"/>',
  );
  write('about/index.html', '<meta name="robots" content="index, follow"/>');
  write('library/index.html', '<head><title>no robots</title></head>');
  write(
    'mixed/index.html',
    '<meta name="robots" content="noindex"/><meta name="robots" content="index"/>',
  );
  write('_next/static/x.js', 'not html');
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('checkNoindex', () => {
  it('lists every HTML file that is indexable, missing the tag, or contradicted by a later tag', () => {
    const { bad, total } = checkNoindex(root);
    expect(total).toBe(5);
    expect(bad.map((b) => b.file).sort()).toEqual([
      'about/index.html',
      'library/index.html',
      'mixed/index.html',
    ]);
    expect(bad.find((b) => b.file === 'about/index.html')!.robots).toEqual(['index, follow']);
  });
});
