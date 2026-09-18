import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { WorkerPool, validJob } from './pool.mjs';

export function createEngineServer({ pool, revision = 'development' }) {
  return createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 503 ? { 'Retry-After': '1' } : {}),
      });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/health') {
      const ready = pool.workers.some(
        (w) => w.child && w.child.exitCode === null,
      );
      return send(ready ? 200 : 503, {
        ready,
        revision,
        protocol: 1,
        engine: 'Bend 2.0.5 native',
        threads: pool.threads,
      });
    }
    if (req.method !== 'POST' || req.url !== '/step')
      return send(404, { error: 'Not found' });
    if (!req.headers['content-type']?.startsWith('application/json'))
      return send(415, { error: 'Expected JSON' });
    let data = '';
    try {
      for await (const chunk of req) {
        data += chunk;
        if (Buffer.byteLength(data) > 5000) {
          send(413, { error: 'Board is too large' });
          return;
        }
      }
      let job;
      try {
        job = JSON.parse(data);
      } catch {
        return send(400, { error: 'Invalid JSON' });
      }
      if (!validJob(job))
        return send(400, {
          error: 'Expected 4096 binary cells and 1–100 steps',
        });
      send(200, await pool.run(job.board, job.steps));
    } catch {
      if (!res.headersSent)
        send(503, {
          error: 'Simulation is busy or restarting. Try again shortly.',
        });
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const threads = Number(process.env.BEND_THREADS || 2);
  if (!Number.isInteger(threads) || threads < 1 || threads > 8)
    throw new Error('BEND_THREADS must be 1–8');
  const pool = new WorkerPool({ threads });
  await pool.warm();
  const revision = existsSync(new URL('./revision.txt', import.meta.url))
    ? readFileSync(new URL('./revision.txt', import.meta.url), 'utf8').trim()
    : 'development';
  const server = createEngineServer({ pool, revision });
  server.requestTimeout = 15000;
  server.headersTimeout = 5000;
  server.listen(
    Number(process.env.PORT || 4180),
    process.env.HOST || '127.0.0.1',
    () => console.log('Bend Life engine ready'),
  );
  const stop = () => {
    pool.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
