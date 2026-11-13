// Minimal local server: serves the static site and runs api/*.js like Vercel does.
// Usage: node scripts/serve.js   (reads .env.local if present), then open http://localhost:3000
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const envFile = join(root, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function wrap(res) {
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(b));
  };
  return res;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z-]/g, '');
      const file = join(root, 'api', `${name}.js`);
      if (!name || !existsSync(file)) return wrap(res).status(404).json({ error: 'Not found' });
      let raw = '';
      for await (const chunk of req) raw += chunk;
      req.query = Object.fromEntries(url.searchParams);
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        req.body = raw;
      }
      const mod = await import(pathToFileURL(file).href);
      return mod.default(req, wrap(res));
    }
    let path = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
    // Match Vercel's cleanUrls: /case-study serves case-study.html.
    if (!extname(path) && existsSync(join(root, `${path}.html`))) path = `${path}.html`;
    try {
      const body = await readFile(join(root, path));
      res.setHeader('Content-Type', TYPES[extname(path)] || 'application/octet-stream');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  })
  .listen(process.env.PORT || 3000, () => console.log(`Party Run on http://localhost:${process.env.PORT || 3000}`));
