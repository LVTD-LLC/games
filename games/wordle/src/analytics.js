// Kept local to each standalone package; no game imports another app's runtime.
let client;
let revision = 'development';
let queue = [];
const preference = 'lvtd-analytics:disabled';
const game = 'wordle';
function disabled() {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true)
    return true;
  try {
    return localStorage.getItem(preference) === '1';
  } catch {
    return true;
  }
}
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
  if (
    disabled() ||
    ['$set', '$identify', '$create_alias'].includes(event.event)
  )
    return null;
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
  if (disabled()) return;
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
  if (!client || disabled()) return {};
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
  if (disabled()) return;
  try {
    client?.captureException(new Error(operation), { operation });
  } catch {}
}
async function init() {
  if (disabled()) {
    queue = [];
    return;
  }
  try {
    const response = await fetch('/analytics-config.json', {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error('Analytics not configured');
    const config = await response.json();
    if (
      !config.token ||
      !config.enabled ||
      !config.hosts?.includes(location.hostname) ||
      disabled()
    ) {
      queue = [];
      return;
    }
    revision = config.revision;
    const { default: posthog } = await import('posthog-js');
    if (disabled()) return;
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
      respect_dnt: true,
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
// Local preference remains usable even when the SDK/network is blocked.
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-analytics-opt-out]');
  if (!button) return;
  try {
    localStorage.setItem(preference, '1');
    client?.opt_out_capturing();
    queue = [];
    button.textContent = 'Analytics disabled in this browser';
    button.disabled = true;
  } catch {
    button.textContent = 'Your browser is already blocking analytics storage';
  }
});
window.addEventListener('storage', (event) => {
  if (event.key === preference && disabled()) {
    queue = [];
    client?.opt_out_capturing();
  }
});
void init();
