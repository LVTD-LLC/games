import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { gamesServer } from './server.mjs';
test('consolidated server routes APIs and serves revision, images, cache headers and real 404s', async (t) => {
  const root = await mkdtemp('/tmp/games-static-');
  await mkdir(root + '/assets');
  for (const [file, body] of Object.entries({
    'index.html': 'Games',
    '404.html': 'Page not found',
    'deploy-revision.txt': 'revision',
    'assets/game.js': 'game',
    'share.png': 'image',
  }))
    await writeFile(root + '/' + file, body);
  let health = 0;
  const server = gamesServer({
    root,
    store: {
      async health() {
        health++;
      },
    },
    judge: {},
    revision: 'revision',
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const revision = await fetch(base + '/deploy-revision.txt');
  assert.equal(await revision.text(), 'revision');
  assert.equal(revision.headers.get('cache-control'), 'no-store');
  const api = await fetch(base + '/api/corporate-bs/health');
  assert.deepEqual(await api.json(), { ok: true, revision: 'revision' });
  assert.equal(health, 1);
  const missing = await fetch(base + '/unknown');
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'Page not found');
  const image = await fetch(base + '/share.png');
  assert.equal(image.headers.get('content-type'), 'image/png');
  const asset = await fetch(base + '/assets/game.js');
  assert.match(asset.headers.get('cache-control'), /immutable/);
  const head = await fetch(base + '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
