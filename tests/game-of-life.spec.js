import { test, expect } from '@playwright/test';
test.describe.configure({ mode: 'serial' });
test('catalogue, real native simulation, presets and fast-forward', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('link').filter({ hasText: 'Game of Life' }).click();
  await expect(page.locator('#board')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: /Blinker —/ }).click();
  await expect(page.locator('#population')).toHaveText('3');
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(page.locator('#generation')).toHaveText('1');
  await expect(page.locator('#population')).toHaveText('3');
  await page.getByRole('button', { name: 'Advance 100 generations →' }).click();
  await expect(page.locator('#generation')).toHaveText('101');
  await expect(page.locator('#notice')).toContainText('CPU threads');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('#state')).toHaveText('Growing');
  await expect
    .poll(async () =>
      Number(
        (await page.locator('#generation').textContent()).replaceAll(',', ''),
      ),
    )
    .toBeGreaterThan(101);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#state')).toHaveText('Paused');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('#generation')).toHaveText('0');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('#population')).toHaveText('0');
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('drawing, keyboard editing and resetting while a response is in flight', async ({
  page,
}) => {
  await page.goto('/game-of-life/');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  const canvas = page.locator('#board');
  await canvas.click({ position: { x: 40, y: 40 } });
  await expect(page.locator('#population')).toHaveText('1');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(page.locator('#population')).toHaveText('2');
  await page.locator('#zoom').selectOption('2');
  await expect(canvas).toHaveCSS(
    'width',
    `${(await page.locator('#viewport').boundingBox()).width * 2}px`,
  );
  let release;
  await page.route('**/api/life/step', async (route) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({
        json: { board: '1'.repeat(4096), steps: 1, elapsedMs: 1, threads: 2 },
      })
      .catch(() => {});
  });
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  release();
  await expect(page.locator('#population')).toHaveText('0');
  await expect(page.locator('#generation')).toHaveText('0');
});
test('backend failure preserves the board and offers recovery', async ({
  page,
}) => {
  await page.goto('/game-of-life/');
  const before = await page.locator('#population').textContent();
  await page.route('**/api/life/step', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Simulation is busy. Try again shortly.' },
    }),
  );
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Try again');
  await expect(page.locator('#state')).toHaveText('Paused');
  await expect(page.locator('#population')).toHaveText(before);
});
