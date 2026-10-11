// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  matchPrefix,
  normalizePrefix,
  parseArgs,
  route,
} from '../../scripts/serve-export-core.mjs';

let tmp: string;
let root: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-export-'));
  root = path.join(tmp, 'out');
  fs.mkdirSync(path.join(root, 'library'), { recursive: true });
  fs.mkdirSync(path.join(root, 'thumbs'));
  fs.writeFileSync(path.join(root, 'index.html'), 'home');
  fs.writeFileSync(path.join(root, '404.html'), 'shell');
  fs.writeFileSync(path.join(root, 'library', 'index.html'), 'library');
  fs.writeFileSync(path.join(root, 'thumbs', 'a b.webp'), 'img');
  // A sibling directory whose name starts with the root's name must never be reachable.
  fs.mkdirSync(path.join(tmp, 'out-secret'));
  fs.writeFileSync(path.join(tmp, 'out-secret', 'x'), 'secret');
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('normalizePrefix', () => {
  it('normalizes to "" or /a/b', () => {
    expect(normalizePrefix(undefined)).toBe('');
    expect(normalizePrefix('/')).toBe('');
    expect(normalizePrefix('asset-library')).toBe('/asset-library');
    expect(normalizePrefix('/asset-library/')).toBe('/asset-library');
  });
});

describe('parseArgs', () => {
  it('keeps the defaults and has no prefix without the flag', () => {
    expect(parseArgs([])).toEqual({ dir: 'out', port: '4317', prefix: '' });
    expect(parseArgs(['out', '4317'])).toEqual({ dir: 'out', port: '4317', prefix: '' });
  });

  it('reads --base (separate, "=" form and anywhere) and the third positional', () => {
    expect(parseArgs(['out', '4318', '--base', '/asset-library'])).toEqual({
      dir: 'out',
      port: '4318',
      prefix: '/asset-library',
    });
    expect(parseArgs(['--base=/asset-library', 'out', '4318']).prefix).toBe('/asset-library');
    expect(parseArgs(['out', '4318', 'asset-library/']).prefix).toBe('/asset-library');
  });
});

describe('matchPrefix', () => {
  it('matches whole segments only', () => {
    expect(matchPrefix('/asset-library/library/', '/asset-library')).toEqual({
      kind: 'inside',
      rest: '/library/',
    });
    expect(matchPrefix('/asset-library/', '/asset-library')).toEqual({ kind: 'inside', rest: '/' });
    expect(matchPrefix('/asset-library', '/asset-library')).toEqual({ kind: 'redirect' });
    expect(matchPrefix('/asset-library-old/x', '/asset-library')).toEqual({ kind: 'outside' });
    expect(matchPrefix('/library/', '/asset-library')).toEqual({ kind: 'outside' });
    expect(matchPrefix('/', '/asset-library')).toEqual({ kind: 'outside' });
  });
});

describe('route without a prefix (unchanged behavior)', () => {
  const opts = () => ({ root });

  it('serves files, directory indexes and the 404 shell', () => {
    expect(route('/', opts())).toMatchObject({
      type: 'file',
      status: 200,
      file: path.join(root, 'index.html'),
    });
    expect(route('/library/', opts())).toMatchObject({
      type: 'file',
      file: path.join(root, 'library', 'index.html'),
    });
    expect(route('/thumbs/a%20b.webp?x=1', opts())).toMatchObject({ type: 'file' });
    expect(route('/nope/', opts())).toEqual({
      type: 'not-found',
      status: 404,
      file: path.join(root, '404.html'),
    });
  });

  it('does not redirect and does not know any prefix', () => {
    expect(route('/asset-library', opts())).toMatchObject({ type: 'not-found' });
    expect(route('/asset-library/', opts())).toMatchObject({ type: 'not-found' });
  });

  it('refuses traversal and sibling directories', () => {
    for (const u of ['/../out-secret/x', '/%2e%2e/out-secret/x', '/..%2fout-secret/x']) {
      expect(route(u, opts()).type, u).toBe('not-found');
    }
  });

  it('answers malformed percent-encoding with bad-request', () => {
    expect(route('/%E0%A4%A', opts())).toEqual({ type: 'bad-request' });
  });
});

describe('route under a prefix', () => {
  const opts = () => ({ root, prefix: '/asset-library' });
  const shell = () => ({ type: 'not-found', status: 404, file: path.join(root, '404.html') });

  it('serves files below the prefix', () => {
    expect(route('/asset-library/', opts())).toMatchObject({
      type: 'file',
      file: path.join(root, 'index.html'),
    });
    expect(route('/asset-library/library/', opts())).toMatchObject({
      type: 'file',
      file: path.join(root, 'library', 'index.html'),
    });
    expect(route('/asset-library/thumbs/a%20b.webp', opts())).toMatchObject({
      type: 'file',
      status: 200,
    });
  });

  it('redirects the bare prefix to the trailing slash (301), keeping the query', () => {
    expect(route('/asset-library', opts())).toEqual({
      type: 'redirect',
      status: 301,
      location: '/asset-library/',
    });
    expect(route('/asset-library?a=1', opts())).toMatchObject({ location: '/asset-library/?a=1' });
  });

  it('answers unknown paths below the prefix with the 404 shell (404)', () => {
    expect(route('/asset-library/publish/new-id/', opts())).toEqual(shell());
    expect(route('/asset-library/_next/missing.js', opts())).toEqual(shell());
  });

  it('answers every path outside the prefix with the 404 shell, even ones that exist in out/', () => {
    expect(route('/', opts())).toEqual(shell());
    expect(route('/library/', opts())).toEqual(shell());
    expect(route('/thumbs/a%20b.webp', opts())).toEqual(shell());
    expect(route('/asset-library-old/', opts())).toEqual(shell());
  });

  it('keeps the traversal protection', () => {
    for (const u of [
      '/asset-library/../out-secret/x',
      '/asset-library/%2e%2e/out-secret/x',
      '/asset-library/..%2fout-secret/x',
      '/asset-library/../../x',
    ]) {
      expect(route(u, opts()).type, u).toBe('not-found');
    }
  });

  it('answers malformed percent-encoding below the prefix with bad-request', () => {
    expect(route('/asset-library/%E0%A4%A', opts())).toEqual({ type: 'bad-request' });
  });

  it('reports a missing 404.html as file: null', () => {
    const bare = path.join(tmp, 'bare');
    fs.mkdirSync(bare);
    expect(route('/asset-library/x', { root: bare, prefix: '/asset-library' })).toEqual({
      type: 'not-found',
      status: 404,
      file: null,
    });
  });
});
