import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [dir = 'out', port = '4173'] = process.argv.slice(2);
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

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const candidates = [clean, path.join(clean, 'index.html'), clean + '.html'];
  for (const c of candidates) {
    const f = path.join(root, c);
    // Must stay inside root (a bare startsWith(root) would also accept sibling "out-secret").
    if (f !== root && !f.startsWith(root + path.sep)) continue;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

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
    let file;
    try {
      file = resolveFile(req.url ?? '/');
    } catch {
      // Malformed percent-encoding.
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Bad request');
    }
    if (file) {
      return pipeFile(res, file, 200, types[path.extname(file)] ?? 'application/octet-stream');
    }
    // GitHub Pages serves /404.html with status 404 for unknown paths.
    const nf = path.join(root, '404.html');
    if (fs.existsSync(nf)) return pipeFile(res, nf, 404, 'text/html');
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  })
  .listen(Number(port), () => console.log(`serving ${root} on :${port}`));
