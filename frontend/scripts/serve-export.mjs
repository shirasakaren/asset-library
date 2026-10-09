import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [dir = 'out', port = '4173'] = process.argv.slice(2);
const root = path.resolve(dir);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.txt': 'text/plain', '.woff2': 'font/woff2' };

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const candidates = [clean, path.join(clean, 'index.html'), clean + '.html'];
  for (const c of candidates) {
    const f = path.join(root, c);
    if (f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

http.createServer((req, res) => {
  const file = resolveFile(req.url);
  if (file) {
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }
  // GitHub Pages serves /404.html with status 404 for unknown paths.
  const nf = path.join(root, '404.html');
  res.writeHead(404, { 'Content-Type': 'text/html' });
  fs.existsSync(nf) ? fs.createReadStream(nf).pipe(res) : res.end('Not found');
}).listen(Number(port), () => console.log(`serving ${root} on :${port}`));
