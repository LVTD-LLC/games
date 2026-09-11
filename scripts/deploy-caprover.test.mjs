import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploy } from './deploy-caprover.mjs';

const fixture = {
  server: 'https://captain.example.test',
  appName: 'test-app',
  appToken: 'test-only',
  productionUrl: 'https://app.example.test',
  gitSha: 'a'.repeat(40),
  archive: new Uint8Array([1, 2, 3]),
  pause: async () => {},
  attempts: 3,
};

test('waits for the exact revision, not just HTTP 200 or an accepted upload', async () => {
  let polls = 0;
  await deploy({
    ...fixture,
    request: async (url, options) => {
      if (options.method === 'POST') {
        assert.equal(options.body.get('gitHash'), fixture.gitSha);
        assert.equal(options.headers['x-captain-app-token'], fixture.appToken);
        return Response.json({ status: 101 });
      }
      assert.equal(new URL(url).hostname, 'app.example.test');
      assert.equal(options.headers['x-captain-app-token'], undefined);
      polls++;
      if (polls === 1) throw new Error('Temporary rollout connection failure');
      return new Response(
        polls === 2 ? 'previous revision' : fixture.gitSha + '\n',
      );
    },
  });
  assert.equal(polls, 3);
});

test('rejected uploads fail without polling production or exposing the response body', async () => {
  for (const response of [
    new Response('private response', { status: 403 }),
    Response.json({ status: 1100, description: 'private response' }),
  ]) {
    let calls = 0;
    await assert.rejects(
      deploy({
        ...fixture,
        request: async () => {
          calls++;
          return response;
        },
      }),
      /CapRover (upload failed|rejected deployment)/,
    );
    assert.equal(calls, 1);
  }
});

test('a build that never reaches production fails after a bounded number of polls', async () => {
  let polls = 0;
  await assert.rejects(
    deploy({
      ...fixture,
      request: async (_, options) => {
        if (options.method === 'POST') return Response.json({ status: 100 });
        polls++;
        return new Response('old revision');
      },
    }),
    /did not serve the expected revision/,
  );
  assert.equal(polls, fixture.attempts);
});
