// Static server for `out/` that mimics GitHub Pages (files, else `/404.html` with status 404).
//
//   node scripts/serve-export.mjs [dir=out] [port=4317] [base] [--base <prefix>]
//
// With a base prefix (`--base /asset-library`, or the third positional) `out/` is served under it,
// like a project Pages site: `/asset-library` redirects (301) to `/asset-library/`, paths below it
// resolve to files or the 404 shell, and every path outside it is the 404 shell too.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, route } from './serve-export-core.mjs';

const { dir, port, prefix } = parseArgs(process.argv.slice(2));
const root = path.resolve(dir);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
};

function pipeFile(res, file, status, contentType) {
  const stream = fs.createReadStream(file);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end();
  });
  stream.on('open', () => {
    res.writeHead(status, { 'Content-Type': contentType });
    stream.pipe(res);
  });
}

http
  .createServer((req, res) => {
    const r = route(req.url ?? '/', { root, prefix });
    switch (r.type) {
      case 'bad-request':
        // Malformed percent-encoding.
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end('Bad request');
      case 'redirect':
        res.writeHead(r.status, { Location: r.location });
        return res.end();
      case 'file':
        return pipeFile(res, r.file, r.status, types[path.extname(r.file)] ?? 'application/octet-stream');
      default:
        // GitHub Pages serves /404.html with status 404 for unknown paths.
        if (r.file) return pipeFile(res, r.file, 404, 'text/html');
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
    }
  })
  .listen(Number(port), () =>
    console.log(`serving ${root} on :${port}${prefix ? ` under ${prefix}/` : ''}`),
  );
