import { test, expect } from '@playwright/test';

test.setTimeout(90000);

// Headless CI uses software WebGL. Normal browsers still choose WebGPU first.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'gpu', { value: undefined }),
  );
});

test('catalogue, garage customization, saved settings and narrow layout', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page
    .getByRole('link')
    .filter({ hasText: 'Little City Racers' })
    .click();
  await expect(page.getByRole('button', { name: 'Let’s drive!' })).toBeEnabled({
    timeout: 30000,
  });
  await expect(page.locator('#world')).toHaveAttribute(
    'data-renderer',
    'webgl2',
  );
  await expect(page.locator('#car-count')).toHaveText('3');
  await page.getByRole('button', { name: 'Blue', exact: true }).click();
  await page.getByRole('button', { name: 'More cars' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Let’s drive!' })).toBeEnabled({
    timeout: 30000,
  });
  await expect(
    page.getByRole('button', { name: 'Blue', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#car-count')).toHaveText('4');
  for (let i = 0; i < 2; i++)
    await page.getByRole('button', { name: 'More cars' }).click();
  await expect(page.getByRole('button', { name: 'More cars' })).toBeDisabled();
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Fewer cars' }).click();
  await expect(page.getByRole('button', { name: 'Fewer cars' })).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('#start')).toBeInViewport();
  await expect(
    page.getByRole('button', { name: 'Purple', exact: true }),
  ).toBeInViewport({ ratio: 1 });
  expect(errors).toEqual([]);
});

test('arrow controls, brake, focus-loss pause and replay setup', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/city-racers/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  await page.locator('#start').click();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'racing', {
    timeout: 20000,
  });
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => Number(await page.locator('#speed').textContent()), {
      timeout: 15000,
    })
    .toBeGreaterThan(15);
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(
      async () =>
        Number(
          await page.locator('.progress-track').getAttribute('aria-valuenow'),
        ),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await expect(page.locator('#speed')).toHaveText('0', { timeout: 10000 });
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowUp');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('dialog')).toContainText('Taking a little break');
  await page.getByRole('button', { name: 'Keep driving' }).click();
  await expect(page.locator('#speed')).toHaveText('0');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Choose a car' }).click();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'garage');
  await expect(page.locator('#start')).toBeVisible();
  expect(errors).toEqual([]);
});

test('touch hold and pointer cancellation work when storage is unavailable', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    }),
  );
  await page.goto('/city-racers/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  await page.locator('#start').click();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'racing', {
    timeout: 20000,
  });
  const gas = page.getByRole('button', { name: 'Accelerate', exact: true });
  // Dispatch browser pointer events with a genuine active pointer via mouse: same pointer handlers as touch.
  const bounds = await gas.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await expect
    .poll(async () => Number(await page.locator('#speed').textContent()), {
      timeout: 15000,
    })
    .toBeGreaterThan(10);
  await gas.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect(gas).not.toHaveClass(/pressed/);
  await expect(page.locator('#speed')).toHaveText('0', { timeout: 15000 });
});

test('no graphics support shows recovery instead of a broken start button', async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto('/city-racers/');
  await expect(page.getByRole('alert')).toContainText(
    'couldn’t start the 3D city',
    { timeout: 30000 },
  );
  await expect(page.getByRole('link', { name: 'Back to games' })).toBeVisible();
});

test('a full lap with the steering held down finishes and can be replayed', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/city-racers/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  await page.locator('#start').click();
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await expect(page.getByRole('dialog')).toContainText('Nice driving!', {
    timeout: 90000,
  });
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowLeft');
  await expect(page.locator('.progress-track')).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await page.getByRole('button', { name: 'Race again' }).click();
  await expect(page.locator('#game')).toHaveAttribute(
    'data-phase',
    'countdown',
  );
  await expect(page.locator('#speed')).toHaveText('0');
  await expect(page.locator('.progress-track')).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  expect(errors).toEqual([]);
});
