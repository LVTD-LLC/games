import { test, expect } from '@playwright/test';
test.skip(
  Boolean(process.env.BASE_URL),
  'Create result fixtures only against the isolated test server.',
);
async function attempt(
  request,
  phrase = 'We should socialize the synergy roadmap before we align on the alignment.',
) {
  await request.get('/api/corporate-bs/session');
  const headers = { Origin: 'http://localhost:4173' };
  expect(
    (
      await request.post('/api/corporate-bs/profile', {
        headers,
        data: { name: 'Pete' },
      })
    ).ok(),
  ).toBeTruthy();
  const response = await request.post('/api/corporate-bs/score', {
    headers,
    data: { phrase },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
test('detail sharing copies attribution and canonical URL, supplies social intents and fits narrow screens', async ({
  page,
  request,
}) => {
  const result = await attempt(request);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text) => {
          window.copied = text;
        },
      },
    });
    Object.defineProperty(navigator, 'share', { value: undefined });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const response = await page.goto(
    `/corporate-bs-meter/result/${result.id}/?source=test`,
  );
  expect(response.headers()['content-security-policy']).toContain(
    "script-src 'self' https://us-assets.i.posthog.com;",
  );
  const url = `http://localhost:4173/corporate-bs-meter/result/${result.id}/`;
  await expect(
    page.getByRole('heading', { name: 'Circulate the memo.' }),
  ).toBeVisible();
  await expect(page.locator('#detail-native')).toBeHidden();
  await page.getByRole('button', { name: 'Copy result & link' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Result and challenge link copied.',
  );
  const text = await page.evaluate(() => window.copied);
  expect(text).toContain(`Pete scored ${result.score.toFixed(1)}/100`);
  expect(text).toContain(result.phrase);
  expect(text).toContain(url);
  expect(text).not.toContain('source=test');
  expect(text).not.toContain('I scored');
  for (const id of ['detail-threads', 'detail-whatsapp']) {
    const href = new URL(await page.locator('#' + id).getAttribute('href'));
    expect(href.searchParams.get('text')).toBe(text);
  }
  const x = new URL(await page.locator('#detail-x').getAttribute('href'));
  expect(x.searchParams.get('url')).toBe(url);
  expect(x.searchParams.get('text').length + 24).toBeLessThanOrEqual(280);
  const linkedin = page.locator('#detail-linkedin');
  expect(
    new URL(await linkedin.getAttribute('href')).searchParams.get('url'),
  ).toBe(url);
  // Exercise the real link handler without sending anything to a social network.
  await page
    .context()
    .route('https://www.linkedin.com/**', (route) =>
      route.fulfill({ body: 'Share destination' }),
    );
  const popupPromise = page.waitForEvent('popup');
  await linkedin.click();
  const popup = await popupPromise;
  await popup.close();
  await expect(page.getByRole('status')).toHaveText(
    'Post text copied. Paste it into your LinkedIn post.',
  );
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  for (const id of [
    'detail-copy',
    'detail-x',
    'detail-threads',
    'detail-whatsapp',
    'detail-linkedin',
  ]) {
    const box = await page.locator('#' + id).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#detail-copy').focus();
  await expect(page.locator('#detail-copy')).toBeFocused();
  expect(errors).toEqual([]);
});
test('clipboard denial offers selected fallback; native share handles success, cancellation and failure', async ({
  page,
  request,
}) => {
  const result = await attempt(
    request,
    'We need to operationalize the synergy agenda.',
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new DOMException('Denied', 'NotAllowedError');
        },
      },
    });
    Object.defineProperty(navigator, 'share', {
      value: async (data) => {
        window.shared = data;
        if (window.shareError)
          throw new DOMException('Share failed', window.shareError);
      },
    });
  });
  await page.goto(`/corporate-bs-meter/result/${result.id}/`);
  await page.getByRole('button', { name: 'Copy result & link' }).click();
  const field = page.getByLabel('Result and link to share');
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  expect(
    await field.evaluate((el) => el.selectionEnd - el.selectionStart),
  ).toBe((await field.inputValue()).length);
  await page.getByRole('button', { name: 'More share options' }).click();
  const shared = await page.evaluate(() => window.shared);
  expect(shared.text).toContain(result.phrase);
  expect(shared.url).toContain(result.id);
  await page.evaluate(() => {
    window.shareError = 'AbortError';
  });
  await page.getByRole('button', { name: 'More share options' }).click();
  await expect(page.getByRole('status')).toHaveText('');
  await page.evaluate(() => {
    window.shareError = 'NotAllowedError';
  });
  await page.getByRole('button', { name: 'More share options' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Sharing is unavailable',
  );
});
test('result is shareable without JavaScript and quoted markup cannot inject HTML', async ({
  browser,
  request,
}) => {
  const phrase =
    '</textarea><img src=x onerror="alert(1)"> & synergy for the board.';
  const result = await attempt(request, phrase);
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 900 },
  });
  try {
    const page = await context.newPage();
    await page.goto(
      `http://localhost:4173/corporate-bs-meter/result/${result.id}/`,
    );
    await expect(page.locator('.attempt-phrase')).toHaveText(`“${phrase}”`);
    await expect(page.locator('.attempt img')).toHaveCount(0);
    await expect(page.locator('#detail-copy')).toBeHidden();
    await expect(page.getByLabel('Result and link to share')).toBeVisible();
    expect(
      await page.getByLabel('Result and link to share').inputValue(),
    ).toContain(phrase);
    await expect(page.locator('#detail-whatsapp')).toBeVisible();
    expect(
      new URL(
        await page.locator('#detail-whatsapp').getAttribute('href'),
      ).searchParams.get('text'),
    ).toContain(phrase);
  } finally {
    await context.close();
  }
});
