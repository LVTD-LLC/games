import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createLifeProxy } from './life-proxy.mjs';
test('proxy keeps fixed routes, denies cross-origin computation and bounds payloads', async () => {
  let calls = 0;
  const upstream = createServer((req, res) => {
    calls++;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const proxy = createServer(
    createLifeProxy({
      origin: 'http://game.test',
      engineUrl: `http://127.0.0.1:${upstream.address().port}`,
    }),
  );
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const post = (body, origin = 'http://game.test') =>
    fetch(base + '/api/life/step', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body,
    });
  try {
    assert.equal((await post('{}', 'http://elsewhere.test')).status, 403);
    assert.equal((await post('x'.repeat(6000))).status, 413);
    assert.equal((await fetch(base + '/api/life/unknown')).status, 404);
    assert.equal(calls, 0);
    assert.equal((await post('{}')).status, 200);
    assert.equal(calls, 1);
  } finally {
    await Promise.all([
      new Promise((r) => proxy.close(r)),
      new Promise((r) => upstream.close(r)),
    ]);
  }
});
