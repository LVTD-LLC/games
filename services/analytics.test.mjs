import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalytics } from './analytics.mjs';
const distinct = '019f1234-1234-7123-8123-123456789abc';
const session = '019f1234-5678-7123-8123-123456789abc';
const req = {
  headers: {
    'x-posthog-distinct-id': distinct,
    'x-posthog-session-id': session,
    cookie: 'secret',
    'user-agent': 'private',
  },
};
test('server events correlate anonymous browser sessions without cookies or request content', async () => {
  const captured = [],
    errors = [];
  let stopped = false;
  const analytics = createAnalytics(
    { enabled: true, token: 'public', host: 'host', revision: 'sha' },
    () => ({
      on() {},
      capture: (event) => captured.push(event),
      captureException: (...args) => errors.push(args),
      shutdown: async () => {
        stopped = true;
      },
    }),
  );
  analytics.capture(req, 'bs_score_completed', {
    game: 'corporate-bs-meter',
    score: 42,
  });
  assert.equal(captured[0].distinctId, distinct);
  assert.equal(captured[0].properties.$session_id, session);
  assert.equal(captured[0].properties.$process_person_profile, false);
  assert.equal(captured[0].properties.release, 'sha');
  assert.equal(JSON.stringify(captured).includes('secret'), false);
  analytics.capture({ headers: {} }, 'ignored');
  analytics.capture(
    {
      headers: { ...req.headers, 'x-posthog-distinct-id': 'person@email.test' },
    },
    'ignored',
  );
  assert.equal(captured.length, 1);
  analytics.capture(req, 'game_api_failed', {
    status: 503,
    operation: 'score',
  });
  assert.equal(errors.length, 1);
  assert.equal(errors[0][1], distinct);
  await analytics.shutdown();
  assert.equal(stopped, true);
});
test('disabled analytics and transport failures never interrupt play or shutdown', async () => {
  const disabled = createAnalytics({}, () => {
    throw new Error('should not initialize');
  });
  assert.doesNotThrow(() => disabled.capture(req, 'test'));
  const broken = createAnalytics({ enabled: true, token: 'public' }, () => ({
    on() {},
    capture() {
      throw new Error('offline');
    },
    shutdown() {
      throw new Error('offline');
    },
  }));
  assert.doesNotThrow(() => broken.capture(req, 'test'));
  await broken.shutdown();
});
