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
        request: async (_, options) => {
          if (options.method !== 'POST') return new Response('old');
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
  assert.equal(polls, fixture.attempts + 1);
});

test('retries only the timed-out image build and verifies native readiness', async () => {
  let uploads = 0,
    polls = 0;
  await deploy({
    ...fixture,
    appName: 'games-life',
    request: async (url, opts) => {
      if (opts.method === 'POST') {
        assert.equal(new URL(url).search, '');
        uploads++;
        if (uploads === 1)
          return Response.json({
            status: 1109,
            description:
              'failed to resolve source metadata for node:24: context deadline exceeded',
          });
        return Response.json({ status: 100 });
      }
      assert.equal(new URL(url).pathname, '/api/life/health');
      polls++;
      return Response.json({
        revision: fixture.gitSha,
        ready: uploads === 2 && polls > 3,
        protocol: 1,
      });
    },
  });
  assert.equal(uploads, 2);
});

test('reconciles a lost proxy response and skips already live apps', async () => {
  let live = false,
    uploads = 0;
  const run = () =>
    deploy({
      ...fixture,
      request: async (_, opts) => {
        if (opts.method === 'POST') {
          uploads++;
          live = true;
          return new Response(null, { status: 504 });
        }
        return new Response(live ? fixture.gitSha : 'old');
      },
    });
  await run();
  await run();
  assert.equal(uploads, 1);
});

test('does not retry application build errors or expose their details', async () => {
  let uploads = 0;
  await assert.rejects(
    deploy({
      ...fixture,
      request: async (_, opts) => {
        if (opts.method !== 'POST') return new Response('old');
        uploads++;
        return Response.json({
          status: 1109,
          description: 'private application build error',
        });
      },
    }),
    /^Error: CapRover rejected deployment \(status 1109\)\.$/,
  );
  assert.equal(uploads, 1);
});

test('an unconfirmed upload that never appears gets at most one resubmission', async () => {
  let uploads = 0;
  await assert.rejects(
    deploy({
      ...fixture,
      request: async (_, opts) => {
        if (opts.method === 'POST') {
          uploads++;
          return new Response(null, { status: 504 });
        }
        return new Response('still old');
      },
    }),
    /did not serve the expected revision/,
  );
  assert.equal(uploads, 2);
});
