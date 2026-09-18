import { PostHog } from 'posthog-node';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createAnalytics(
  config = {},
  makeClient = (token, options) => new PostHog(token, options),
) {
  const client =
    config.enabled && config.token
      ? makeClient(config.token, {
          host: config.host,
          flushAt: 20,
          flushInterval: 10000,
          requestTimeout: 3000,
          fetchRetryCount: 0,
          disableGeoip: true,
        })
      : null;
  // SDK/network errors are deliberately isolated from game requests.
  client?.on('error', () => {});
  function capture(req, event, properties = {}) {
    const distinctId = req.headers['x-posthog-distinct-id'];
    const session = req.headers['x-posthog-session-id'];
    if (!client || !uuid.test(distinctId || '') || !uuid.test(session || ''))
      return;
    try {
      const metadata = {
        ...properties,
        $session_id: session,
        $process_person_profile: false,
        app: 'lvtd-games',
        environment: 'production',
        release: config.revision,
        is_test: req.headers['x-posthog-test'] === 'true',
        analytics_version: 1,
        $geoip_disable: true,
      };
      client.capture({ distinctId, event, properties: metadata });
      if (event === 'game_api_failed' && properties.status >= 500)
        client.captureException(
          new Error(`Game API unavailable: ${properties.operation}`),
          distinctId,
          metadata,
        );
    } catch {
      /* Optional telemetry cannot change a response. */
    }
  }
  return {
    capture,
    async shutdown() {
      try {
        await client?.shutdown(3000);
      } catch {}
    },
  };
}
