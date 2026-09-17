import { createServer, request } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain',
};
createServer(async (req, res) => {
  if (
    req.url.startsWith('/api/corporate-bs/') ||
    /^\/corporate-bs-meter\/(result|unsubscribe)\//.test(req.url)
  ) {
    const upstream = request(
      new URL(req.url, process.env.BS_API_URL || 'http://127.0.0.1:4174'),
      { method: req.method, headers: req.headers },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Local scoring API is not running.' }));
    });
    req.pipe(upstream);
    return;
  }
  try {
    const url = new URL(req.url, 'http://localhost');
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) && file !== root)
      throw new Error('Invalid path');
    if ((await stat(file)).isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { Location: url.pathname + '/' + url.search });
        res.end();
        return;
      }
      file = path.join(file, 'index.html');
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(4173, '0.0.0.0', () => console.log('Games: http://localhost:4173'));
