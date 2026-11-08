// Zero-dependency static server: `npm start` then open http://localhost:5173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const allowed = new Set(Object.keys(types));
const port = Number(process.env.PORT) || 5173;

createServer(async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end('bad request'); return; }
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  // Only serve files inside the project, with known extensions, never dotfiles.
  if (!file.startsWith(root) || !allowed.has(extname(file)) || file.slice(root.length).split(sep).some(p => p.startsWith('.'))) {
    res.writeHead(404).end('not found'); return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] + '; charset=utf-8', 'x-content-type-options': 'nosniff' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Tremor Choir → http://localhost:${port}`));
