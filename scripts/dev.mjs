#!/usr/bin/env node
// Local preview with live reload: rebuilds on every change and refreshes the browser.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4000;
const clients = new Set();

function build() {
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev'], { stdio: 'inherit' });
    return true;
  } catch {
    console.error('Build failed. Fix the error above and save again.');
    return false;
  }
}
build();

let timer;
for (const target of ['content', 'public', 'scripts', 'site.config.json']) {
  fs.watch(path.join(ROOT, target), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (build()) for (const c of clients) c.write('data: reload\n\n'); }, 100);
  });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon' };
// Close the live-reload stream when leaving a page, or stale streams use up the browser's
// 6-connections-per-host limit and page loads start queueing.
const RELOAD = `<script>(()=>{const es=new EventSource('/__reload');es.onmessage=()=>location.reload();addEventListener('pagehide',()=>es.close())})()</script>`;

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let file = path.normalize(path.join(DIST, url));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!url.endsWith('/')) { res.writeHead(301, { Location: url + '/' }).end(); return; }
    file = path.join(file, 'index.html');
  }
  let status = 200;
  if (!fs.existsSync(file)) { status = 404; file = path.join(DIST, '404.html'); }
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  if (ext === '.html') body = body.toString().replace('</body>', `${RELOAD}</body>`);
  res.writeHead(status, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', Connection: 'close' });
  res.end(body);
}).listen(PORT, () => console.log(`\n  Blog running at http://localhost:${PORT}\n  Edit files in content/ and the page reloads.\n`));
