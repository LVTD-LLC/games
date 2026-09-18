// Kept local to each standalone package; no game imports another app's runtime.
let client;
let revision = 'development';
let queue = [];
const game = 'corporate-bs-meter';
function safePath(path) {
  if (/^\/corporate-bs-meter\/result\//.test(path))
    return '/corporate-bs-meter/result/';
  return [
    '/',
    '/wordle/',
    '/city-racers/',
    '/corporate-bs-meter/',
    '/game-of-life/',
  ].includes(path)
    ? path
    : '/404/';
}
const properties = new Set([
  'token',
  'distinct_id',
  '$device_id',
  '$session_id',
  '$window_id',
  '$lib',
  '$lib_version',
  '$browser',
  '$browser_version',
  '$os',
  '$os_version',
  '$device_type',
  '$screen_height',
  '$screen_width',
  '$viewport_height',
  '$viewport_width',
  '$is_identified',
  '$process_person_profile',
  '$session_entry_referring_domain',
  '$pageview_id',
  '$prev_pageview_id',
  '$prev_pageview_duration',
  '$prev_pageview_max_scroll_percentage',
  '$prev_pageview_last_scroll_percentage',
  'mode',
  'attempts',
  'outcome',
  'resumed',
  'reason',
  'action',
  'target_game',
  'players',
  'map',
  'difficulty',
  'laps',
  'assist',
  'car_count',
  'model',
  'duration_seconds',
  'generation',
  'population',
  'pattern',
  'steps',
  'speed',
  'tool',
  'channel',
  'status',
  'operation',
  'score',
  'challenge',
  'has_name',
  'subscribed',
]);
function sanitize(event) {
  if (['$set', '$identify', '$create_alias'].includes(event.event)) return null;
  delete event.$set;
  delete event.$set_once;
  delete event.$unset;
  const clean = {};
  for (const [key, value] of Object.entries(event.properties || {})) {
    if (
      properties.has(key) ||
      /^\$web_vitals_(LCP|CLS|FCP|INP|TTFB)_value$/.test(key)
    )
      clean[key] = value;
  }
  if (event.event === '$exception') {
    clean.$exception_list = (event.properties.$exception_list || []).map(
      (item) => ({
        type: item.type,
        value: 'Browser exception (message redacted)',
        mechanism: item.mechanism,
        stacktrace: {
          frames: (item.stacktrace?.frames || []).map((frame) => ({
            platform: frame.platform,
            function: frame.function,
            filename: String(frame.filename || '').split(/[?#]/)[0],
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        },
      }),
    );
  }
  const path = safePath(location.pathname);
  event.properties = {
    ...clean,
    game,
    app: 'lvtd-games',
    analytics_version: 1,
    environment: 'production',
    release: revision,
    is_test: navigator.webdriver === true,
    $pathname: path,
    $current_url: location.origin + path,
    $referring_domain: (() => {
      try {
        return new URL(document.referrer).hostname;
      } catch {
        return '$direct';
      }
    })(),
    $process_person_profile: false,
    $geoip_disable: true,
  };
  return event;
}
export function track(event, properties = {}) {
  try {
    if (client)
      client.capture(event, properties, {
        send_instantly: [
          'game_selected',
          'leaderboard_result_selected',
          'bs_challenge_accepted',
        ].includes(event),
      });
    else if (queue.length < 50) queue.push([event, properties]);
  } catch {
    /* Analytics must never interrupt play. */
  }
}
export function analyticsHeaders() {
  if (!client) return {};
  try {
    return {
      'X-POSTHOG-DISTINCT-ID': client.get_distinct_id(),
      'X-POSTHOG-SESSION-ID': client.get_session_id(),
      'X-POSTHOG-TEST': String(navigator.webdriver === true),
    };
  } catch {
    return {};
  }
}
export function reportError(operation) {
  try {
    client?.captureException(new Error(operation), { operation });
  } catch {}
}
async function init() {
  try {
    const response = await fetch('/analytics-config.json', {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error('Analytics not configured');
    const config = await response.json();
    if (
      !config.token ||
      !config.enabled ||
      !config.hosts?.includes(location.hostname)
    ) {
      queue = [];
      return;
    }
    revision = config.revision;
    const { default: posthog } = await import('posthog-js');
    posthog.init(config.token, {
      api_host: config.host,
      ui_host: 'https://us.posthog.com',
      defaults: '2026-05-30',
      persistence: 'localStorage',
      persistence_name: 'lvtd-games-analytics',
      person_profiles: 'never',
      save_campaign_params: false,
      save_referrer: false,
      cross_subdomain_cookie: false,
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      capture_exceptions: true,
      capture_performance: { web_vitals: true, network_timing: false },
      capture_dead_clicks: false,
      capture_heatmaps: false,
      rageclick: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      enable_recording_console_log: false,
      ip: false,
      before_send: sanitize,
      loaded(sdk) {
        client = sdk;
        for (const [event, properties] of queue) track(event, properties);
        queue = [];
      },
    });
  } catch {
    queue = [];
  }
}
void init();
