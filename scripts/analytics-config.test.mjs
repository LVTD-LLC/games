import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsConfig } from './analytics-config.mjs';
test('analytics defaults off and refuses private keys or an unexpected ingestion host', () => {
  assert.equal(analyticsConfig({}).enabled, false);
  assert.throws(() =>
    analyticsConfig({ POSTHOG_PROJECT_TOKEN: 'phx_private' }),
  );
  assert.throws(() => analyticsConfig({ POSTHOG_HOST: 'https://example.com' }));
  const config = analyticsConfig({
    POSTHOG_PROJECT_TOKEN: 'phc_' + 'a'.repeat(32),
    DEPLOY_SHA: 'revision',
  });
  assert.equal(config.enabled, true);
  assert.equal(config.revision, 'revision');
  assert.deepEqual(config.hosts, ['games.lvtd.dev', 'games.cap.gregagi.com']);
});
