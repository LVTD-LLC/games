import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';

test.skip(
  Boolean(process.env.BASE_URL),
  'Telemetry fixtures never send to production.',
);
const token = 'phc_' + 'a'.repeat(32);
async function analytics(page) {
  const events = [];
  // Exercise real ingestion despite the SDK's automatic webdriver/bot filter.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { value: false });
    Object.defineProperty(navigator, 'userAgentData', { value: undefined });
  });
  await page.route('**/analytics-config.json', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        token,
        host: 'https://us.i.posthog.com',
        hosts: ['localhost', '127.0.0.1'],
        revision: 'browser-test',
      },
    }),
  );
  await page.route(
    /https:\/\/us(?:-assets)?\.i\.posthog\.com\//,
    async (route) => {
      const request = route.request();
      const buffer = request.postDataBuffer();
      if (buffer && new URL(request.url()).pathname.includes('/e/')) {
        let text;
        if (buffer[0] === 31 && buffer[1] === 139)
          text = gunzipSync(buffer).toString();
        else {
          text = buffer.toString();
          if (!text.startsWith('{') && !text.startsWith('[')) {
            const form = new URLSearchParams(text);
            const data = Buffer.from(form.get('data') || '', 'base64');
            text =
              form.get('compression') === 'gzip-js'
                ? gunzipSync(data).toString()
                : data.toString();
          }
        }
        const data = JSON.parse(text);
        events.push(...(data.batch || (Array.isArray(data) ? data : [data])));
      }
      // Exception/web-vitals extension scripts are bundled separately by the SDK.
      // These are read-only static assets; no events reach the real project.
      if (request.resourceType() === 'script') return route.continue();
      await route.fulfill({ json: { status: 1 } });
    },
  );
  return events;
}
async function seen(events, name) {
  await expect
    .poll(() => events.some((event) => event.event === name), {
      timeout: 15000,
    })
    .toBe(true);
  return events.find((event) => event.event === name);
}
test('anonymous identity follows catalogue to Wordle; guesses and URL secrets stay private; completion is not replayed on reload', async ({
  page,
}) => {
  const events = await analytics(page);
  await page.clock.setFixedTime(new Date('2026-09-11T12:00:00Z'));
  await page.goto('/?email=secret@example.com&utm_source=private-secret');
  const catalogue = await seen(events, '$pageview');
  await page.locator('[data-game="wordle"]').click();
  await seen(events, 'game_selected');
  await expect
    .poll(() => events.filter((e) => e.event === '$pageview').length, {
      timeout: 15000,
    })
    .toBe(2);
  for (const letter of 'рукав')
    await page.locator(`[data-key="${letter}"]`).click();
  await page
    .getByRole('button', { name: 'Проверить слово', exact: true })
    .click();
  const complete = await seen(events, 'game_completed');
  expect(complete.properties.distinct_id).toBe(
    catalogue.properties.distinct_id,
  );
  expect(complete.properties.$session_id).toBe(
    catalogue.properties.$session_id,
  );
  expect(complete.properties).toMatchObject({
    game: 'wordle',
    outcome: 'won',
    attempts: 1,
    token,
  });
  expect(JSON.stringify(events)).not.toMatch(
    /рукав|РУКАВ|secret@example|private-secret/,
  );
  await page.reload();
  await expect
    .poll(() => events.filter((e) => e.event === '$pageview').length, {
      timeout: 15000,
    })
    .toBe(3);
  expect(events.filter((e) => e.event === 'game_completed')).toHaveLength(1);
});
test('BS Meter events and API correlation omit profile and phrase content, including result pages', async ({
  page,
}) => {
  const events = await analytics(page);
  await page.goto('/corporate-bs-meter/');
  await seen(events, '$pageview');
  await page.getByRole('button', { name: 'Skip and play anonymously' }).click();
  await page
    .locator('#phrase')
    .fill('Secret confidential synergy from person@example.com');
  const request = page.waitForRequest('**/api/corporate-bs/score');
  await page.getByRole('button', { name: 'Measure my BS' }).click();
  const headers = (await request).headers();
  const complete = await seen(events, 'game_completed');
  expect(headers['x-posthog-distinct-id']).toBe(
    complete.properties.distinct_id,
  );
  expect(headers['x-posthog-session-id']).toBe(complete.properties.$session_id);
  const link = new URL(await page.locator('#share-x').getAttribute('href'));
  await page.goto(link.searchParams.get('url'));
  await expect
    .poll(() => events.filter((e) => e.event === '$pageview').length, {
      timeout: 15000,
    })
    .toBe(2);
  const resultView = events.filter((e) => e.event === '$pageview').at(-1);
  expect(resultView.properties.$pathname).toBe('/corporate-bs-meter/result/');
  await page
    .locator('#detail-x')
    .evaluate((link) =>
      link.addEventListener('click', (event) => event.preventDefault()),
    );
  await page.locator('#detail-x').click();
  await seen(events, 'game_share_opened');
  expect(JSON.stringify(events)).not.toMatch(
    /confidential|person@example|Secret/,
  );
});
test('Life controls send bounded events instead of a capture for every simulation tick', async ({
  page,
}) => {
  const events = await analytics(page);
  await page.goto('/game-of-life/');
  await seen(events, '$pageview');
  await page.getByRole('button', { name: /Blinker —/ }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await seen(events, 'game_started');
  await expect
    .poll(async () => Number(await page.locator('#generation').textContent()))
    .toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await seen(events, 'game_paused');
  expect(events.filter((e) => e.event === 'game_started')).toHaveLength(1);
  expect(events.filter((e) => e.event === 'simulation_advanced')).toHaveLength(
    0,
  );
  expect(JSON.stringify(events)).not.toContain('00000000000000000000');
});
test('opt-out persists across games, strips API correlation, and DNT suppresses collection', async ({
  page,
  context,
}) => {
  const events = await analytics(page);
  await page.goto('/privacy/');
  await seen(events, '$pageview');
  await page.locator('[data-analytics-opt-out]').click();
  const before = events.length;
  await page.goto('/wordle/');
  await page.locator('#help').click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.goto('/corporate-bs-meter/');
  await page.getByRole('button', { name: 'Skip and play anonymously' }).click();
  await page.locator('#phrase').fill('A little synergy goes a long way.');
  const request = page.waitForRequest('**/api/corporate-bs/score');
  await page.locator('#judge-button').click();
  expect((await request).headers()['x-posthog-distinct-id']).toBeUndefined();
  await expect(page.locator('#score')).toHaveText('92.7');
  expect(events.length).toBe(before);
  const other = await context.newPage();
  await other.addInitScript(() =>
    Object.defineProperty(navigator, 'doNotTrack', { value: '1' }),
  );
  const suppressed = await analytics(other);
  await other.goto('/city-racers/');
  await expect(other.locator('#start')).toBeEnabled();
  await other.locator('#start').click();
  await expect(other.locator('#game')).toHaveAttribute(
    'data-phase',
    /countdown|racing/,
  );
  expect(suppressed).toHaveLength(0);
});
test('unavailable analytics configuration leaves gameplay and the 404 page usable', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/analytics-config.json', (route) => route.abort());
  await page.goto('/wordle/');
  for (const letter of 'слово')
    await page.locator(`[data-key="${letter}"]`).click();
  await page
    .getByRole('button', { name: 'Проверить слово', exact: true })
    .click();
  await expect(page.locator('#attempts')).toHaveText('1 / 6 попыток');
  await page.goto('/not-a-game');
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('racing configuration/start/pause and sanitized exception stacks reach the SDK', async ({
  page,
}) => {
  const events = await analytics(page);
  await page.goto('/city-racers/');
  await seen(events, '$pageview');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#duo').click();
  await page.locator('#start').click();
  const start = await seen(events, 'game_started');
  expect(start.properties).toMatchObject({ game: 'city-racers', players: 2 });
  await page.locator('#pause').click();
  await seen(events, 'game_paused');
  await page.evaluate(() =>
    setTimeout(() => {
      throw new Error('private-player@example.com');
    }, 0),
  );
  const exception = await seen(events, '$exception');
  expect(
    exception.properties.$exception_list[0].stacktrace.frames.length,
  ).toBeGreaterThan(0);
  expect(JSON.stringify(exception)).not.toContain('private-player@example.com');
});
for (const signal of ['doNotTrack', 'globalPrivacyControl']) {
  test(`${signal} disables analytics before configuration or SDK requests`, async ({
    page,
  }) => {
    const requests = [];
    page.on('request', (request) => {
      if (/analytics-config|posthog\.com/.test(request.url()))
        requests.push(request.url());
    });
    await page.addInitScript(
      (signal) =>
        Object.defineProperty(navigator, signal, {
          value: signal === 'doNotTrack' ? '1' : true,
        }),
      signal,
    );
    await page.goto('/wordle/');
    await page.locator('#help').click();
    await expect(page.locator('#help-dialog')).toBeVisible();
    expect(requests).toEqual([]);
  });
}
