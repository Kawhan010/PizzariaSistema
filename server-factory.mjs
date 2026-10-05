import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { openDatabase } from './backend/database.mjs';
import { createApi } from './backend/api.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
export function createApp({ root = process.cwd(), databasePath = resolve(root, 'data/dominos.sqlite') } = {}) {
  const db = openDatabase(databasePath);
  const api = createApi(db);
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      if (await api.handle(req, res)) return;
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = resolve(root, '.' + pathname);
      const relative = file.slice(root.length + 1);
      if (!file.startsWith(root + sep) || !['index.html', 'styles.css', 'app.js', 'catalog.js'].includes(relative) && !relative.startsWith('assets' + sep)) {
        res.writeHead(404); res.end('Não encontrado'); return;
      }
      const content = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { if (!res.headersSent) res.writeHead(404); res.end('Não encontrado'); }
  });
  server.on('close', () => { api.close(); db.close(); });
  return { server, db, stop() { api.close(); server.close(); server.closeAllConnections(); } };
}
