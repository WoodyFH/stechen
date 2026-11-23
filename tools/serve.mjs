// Kleiner statischer Server für lokale Tests. Liefert das Projekt unter /stechen/
// aus, so wie es später auf GitHub Pages (nutzername.github.io/stechen/) läuft.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '/stechen/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function startServer(port = 4173) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/') {
        res.writeHead(302, { Location: BASE }).end();
        return;
      }
      if (!url.pathname.startsWith(BASE)) {
        res.writeHead(404).end('Not found');
        return;
      }
      let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || rel.startsWith('node_modules') || rel.startsWith('.git')) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      await stat(file);
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'max-age=0',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4173;
  await startServer(port);
  console.log(`Stechen läuft auf http://localhost:${port}${BASE}`);
}
