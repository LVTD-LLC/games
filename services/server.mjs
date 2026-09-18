import { createJess } from './jess/server.mjs';
import { createJev } from './jess/jev.mjs';
import { createAnalytics } from './analytics.mjs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import sirv from 'sirv';
import { createLifeProxy } from './life-proxy.mjs';
import { createApp } from './corporate-bs-api/server.mjs';
import { openStore } from './corporate-bs-api/store.mjs';
import { createJudge } from './corporate-bs-api/scoring.mjs';
export function gamesServer({
  store,
  judge,
  chooseJess,
  root = 'dist',
  analytics = { capture() {} },
  ...options
}) {
  const jess = createJess({
    store,
    choose: chooseJess,
    origin: options.origin,
    trustProxy: options.trustProxy,
    dailyBudget: options.jessDailyBudget,
  });
  const life = createLifeProxy({
    origin: options.origin,
    trustProxy: options.trustProxy,
  });
  const api = createApp({ store, judge, analytics, ...options }).listeners(
    'request',
  )[0];
  const files = sirv(root, {
    etag: true,
    setHeaders(res, pathname) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader(
        'Cache-Control',
        /\/(assets|_astro)\//.test(pathname)
          ? 'public, max-age=31536000, immutable'
          : pathname.endsWith('/deploy-revision.txt')
            ? 'no-store'
            : 'no-cache',
      );
    },
  });
  const notFound = readFileSync(`${root}/404.html`);
  const server = createServer((req, res) => {
    if (req.url.startsWith('/api/jess/')) return jess(req, res);
    if (req.url.startsWith('/api/life/')) {
      if (req.url.split('?')[0] === '/api/life/step') {
        const started = performance.now();
        res.once('finish', () => {
          if (res.statusCode >= 400)
            analytics.capture(req, 'game_api_failed', {
              game: 'game-of-life',
              operation: 'simulation_step',
              status: res.statusCode,
              duration_seconds: (performance.now() - started) / 1000,
            });
        });
      }
      return life(req, res);
    }
    if (/^\/(api\/|corporate-bs-meter\/(result|unsubscribe)\/)/.test(req.url))
      return api(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405);
      return res.end();
    }
    files(req, res, () => {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : notFound);
    });
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.TYPESAFE_API_KEY)
    throw new Error('TYPESAFE_API_KEY is required');
  const store = await openStore(); // Migrations finish before accepting traffic.
  const analytics = createAnalytics(
    JSON.parse(readFileSync('dist/analytics-config.json', 'utf8')),
  );
  const server = gamesServer({
    analytics,
    store,
    chooseJess: createJev({
      apiKey: process.env.TYPESAFE_API_KEY,
      model: process.env.TYPESAFE_MODEL || 'jev-1.13.0',
    }),
    jessDailyBudget: Number(process.env.JESS_DAILY_JUDGING_LIMIT) || 3000,
    judge: createJudge({
      apiKey: process.env.TYPESAFE_API_KEY,
      model: process.env.TYPESAFE_MODEL || 'jev-1.13.0',
    }),
    origin: process.env.PUBLIC_ORIGIN || 'https://games.lvtd.dev',
    secure: process.env.COOKIE_SECURE !== 'false',
    trustProxy: process.env.TRUST_PROXY === 'true',
    dailyBudget: Number(process.env.DAILY_JUDGING_LIMIT) || 3000,
    revision:
      process.env.NODE_ENV === 'production'
        ? readFileSync('dist/deploy-revision.txt', 'utf8').trim()
        : 'development',
  });
  server.listen(Number(process.env.PORT) || 80, '0.0.0.0', () =>
    console.log('Games server ready'),
  );
  const shutdown = () => {
    server.close(async () => {
      await analytics.shutdown();
      await store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
