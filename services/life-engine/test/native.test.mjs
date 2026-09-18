import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WorkerPool } from '../pool.mjs';
import { createEngineServer } from '../server.mjs';
const empty = '0'.repeat(4096);
function reference(input) {
  return [...input]
    .map((alive, i) => {
      const x = i % 64,
        y = Math.floor(i / 64);
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (dx || dy)
            neighbors += Number(
              input[((y + dy + 64) % 64) * 64 + ((x + dx + 64) % 64)],
            );
      return neighbors === 3 || (alive === '1' && neighbors === 2) ? '1' : '0';
    })
    .join('');
}
test('native binary agrees with reference on random boards, repeated jobs and CPU thread counts', async () => {
  let random = 98765;
  const seed = Array.from({ length: 4096 }, () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 2 ** 32 < 0.25 ? '1' : '0';
  }).join('');
  for (const threads of [1, 2, 4]) {
    const pool = new WorkerPool({ threads, size: 1 });
    try {
      let expected = seed;
      for (let n = 0; n < 5; n++) expected = reference(expected);
      assert.equal((await pool.run(seed, 5)).board, expected);
      assert.equal((await pool.run(empty, 1)).board, empty);
      assert.equal((await pool.run(seed, 1)).board, reference(seed));
    } finally {
      pool.close();
    }
  }
});
test('worker loss fails its job and subsequent requests restart cleanly', async () => {
  const pool = new WorkerPool({ size: 1 });
  try {
    await pool.warm();
    const result = pool.run(empty, 100);
    const rejected = assert.rejects(result);
    pool.workers[0].child.kill('SIGKILL');
    await rejected;
    assert.equal((await pool.run(empty, 1)).board, empty);
  } finally {
    pool.close();
  }
});
test('HTTP accepts bounded jobs, refuses malformed and oversized input, reports exact revision', async () => {
  const pool = new WorkerPool({ size: 1 });
  await pool.warm();
  const server = createEngineServer({ pool, revision: 'test-revision' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) =>
    fetch(base + '/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await (await fetch(base + '/health')).json()).revision,
      'test-revision',
    );
    for (const body of [
      { board: empty, steps: 0 },
      { board: empty, steps: 101 },
      { board: 'x'.repeat(4096), steps: 1 },
      { board: '0', steps: 1 },
    ])
      assert.equal((await post(body)).status, 400);
    assert.equal(
      (await post({ board: '0'.repeat(6000), steps: 1 })).status,
      413,
    );
    const response = await post({ board: empty, steps: 10 });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).board, empty);
  } finally {
    pool.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
