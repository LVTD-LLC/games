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
  for (let i = 0; i < 8; i++)
    await page.getByRole('button', { name: 'More cars' }).click();
  await expect(page.getByRole('button', { name: 'More cars' })).toBeDisabled();
  for (let i = 0; i < 11; i++)
    await page.getByRole('button', { name: 'Fewer cars' }).click();
  await expect(page.getByRole('button', { name: 'Fewer cars' })).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator('#start').scrollIntoViewIfNeeded();
  await expect(page.locator('#start')).toBeInViewport();
  await page
    .getByRole('button', { name: 'Purple', exact: true })
    .scrollIntoViewIfNeeded();
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
          await page
            .locator('#hud .progress-track')
            .getAttribute('aria-valuenow'),
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
  await expect(page.locator('#hud .progress-track')).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await page.getByRole('button', { name: 'Race again' }).click();
  await expect(page.locator('#game')).toHaveAttribute(
    'data-phase',
    'countdown',
  );
  await expect(page.locator('#speed')).toHaveText('0');
  await expect(page.locator('#hud .progress-track')).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  expect(errors).toEqual([]);
});

test('two-player setup persists and independent WASD/arrow controls survive pause and mode changes', async ({
  page,
}) => {
  await page.goto('/city-racers/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  await page.getByRole('button', { name: 'Two players', exact: true }).click();
  await page.locator('#map').selectOption('city');
  await page
    .getByRole('button', { name: 'Player 2 Yellow', exact: true })
    .click();
  await page.getByRole('button', { name: 'Fewer cars' }).click();
  await expect(page.locator('#car-count')).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Fewer cars' })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Player 2 Coral', exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  await expect(
    page.getByRole('button', { name: 'Two players', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Player 2 Yellow', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map')).toHaveValue('city');
  await page.locator('#start').click();
  await expect(page.locator('#world')).toHaveAttribute('data-views', '2');
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'racing', {
    timeout: 20000,
  });
  // The physical W key still works if its character is Cyrillic on this keyboard.
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyW', key: 'ц', bubbles: true }),
    ),
  );
  await expect
    .poll(async () => Number(await page.locator('#speed-two').textContent()), {
      timeout: 15000,
    })
    .toBeGreaterThan(15);
  await expect(page.locator('#speed')).toHaveText('0');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('s');
  await expect(page.locator('#speed-two')).toHaveText('0', { timeout: 10000 });
  await expect
    .poll(async () => Number(await page.locator('#speed').textContent()))
    .toBeGreaterThan(15);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('dialog')).toBeVisible();
  const progress = await page.locator('#progress').getAttribute('style');
  const progress2 = await page.locator('#progress-two').getAttribute('style');
  await page.waitForTimeout(350);
  await expect(page.locator('#progress')).toHaveAttribute('style', progress);
  await expect(page.locator('#progress-two')).toHaveAttribute(
    'style',
    progress2,
  );
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('s');
  await page.getByRole('button', { name: 'Keep driving' }).click();
  await expect(page.locator('#speed')).toHaveText('0', { timeout: 15000 });
  await expect(page.locator('#speed-two')).toHaveText('0');
  await page.keyboard.press('Escape');
  await page.locator('#garage-button').click();
  await page.getByRole('button', { name: 'One player', exact: true }).click();
  await page.locator('#map').selectOption('park');
  await page.locator('#start').click();
  await expect(page.locator('#world')).toHaveAttribute('data-views', '1');
  await expect(page.locator('#hud-two')).toBeHidden();
});

test('both drivers complete the longer city route, with the first finisher waiting for the second', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/city-racers/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  await page.getByRole('button', { name: 'Two players', exact: true }).click();
  await page.locator('#map').selectOption('city');
  await page.locator('#start').click();
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(
      async () =>
        Number(
          await page
            .locator('#progress')
            .locator('..')
            .getAttribute('aria-valuenow'),
        ),
      { timeout: 25000 },
    )
    .toBeGreaterThan(7);
  await page.keyboard.down('w');
  await page.keyboard.down('a');
  await expect(page.locator('#drive-hint')).toHaveText(
    'Finished! Cheer on Player 2.',
    { timeout: 110000 },
  );
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'racing');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('dialog')).toContainText('Both drivers made it', {
    timeout: 40000,
  });
  for (const key of ['ArrowUp', 'ArrowRight', 'w', 'a'])
    await page.keyboard.up(key);
  await page.getByRole('button', { name: 'Race again' }).click();
  await expect(page.locator('#game')).toHaveAttribute(
    'data-phase',
    'countdown',
  );
  await expect(page.locator('#speed')).toHaveText('0');
  await expect(page.locator('#speed-two')).toHaveText('0');
  await expect(page.locator('#progress-two').locator('..')).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  expect(errors).toEqual([]);
});

test('both on-screen accelerator pads accept simultaneous touches and cancel cleanly', async ({
  page,
}) => {
  await page.goto('/city-racers/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  await page.getByRole('button', { name: 'Two players', exact: true }).click();
  await page.locator('#start').click();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'racing', {
    timeout: 20000,
  });
  const pads = [
    page.getByRole('button', { name: 'Accelerate', exact: true }),
    page.getByRole('button', { name: 'Player 2 accelerate', exact: true }),
  ];
  const points = [];
  for (let i = 0; i < pads.length; i++) {
    const box = await pads[i].boundingBox();
    points.push({
      id: i + 1,
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 5,
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points,
  });
  for (const id of ['speed', 'speed-two'])
    await expect
      .poll(async () => Number(await page.locator(`#${id}`).textContent()), {
        timeout: 15000,
      })
      .toBeGreaterThan(15);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  for (const pad of pads) await expect(pad).not.toHaveClass(/pressed/);
  for (const id of ['speed', 'speed-two'])
    await expect(page.locator(`#${id}`)).toHaveText('0', { timeout: 15000 });
});

test('race options persist; both unassisted drivers can leave the road and recover independently', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/city-racers/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  await page.locator('#duo').click();
  for (let i = 0; i < 9; i++) await page.locator('#more').click();
  await expect(page.locator('#car-count')).toHaveText('12');
  await expect(page.locator('#more')).toBeDisabled();
  await page.locator('.race-options summary').click();
  await page.locator('#assist').uncheck();
  await page.locator('#difficulty').selectOption('real');
  await page.locator('#laps').selectOption('3');
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  await page.locator('.race-options summary').click();
  await expect(page.locator('#assist')).not.toBeChecked();
  await expect(page.locator('#difficulty')).toHaveValue('real');
  await expect(page.locator('#laps')).toHaveValue('3');
  await expect(page.locator('#car-count')).toHaveText('12');
  await page.locator('#start').click();
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'racing', {
    timeout: 20000,
  });
  await expect(page.locator('#lap-tag-two')).toHaveText('Lap 1 / 3');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await expect(page.locator('#drive-hint')).toContainText('Off road', {
    timeout: 12000,
  });
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('r');
  await expect(page.locator('#speed')).toHaveText('0');
  await expect(page.locator('#speed-two')).toHaveText('0');
  await page.keyboard.down('w');
  await page.keyboard.down('a');
  await expect(page.locator('#drive-hint-two')).toContainText('Off road', {
    timeout: 12000,
  });
  await page.keyboard.up('w');
  await page.keyboard.up('a');
  await page.locator('#recover-two').click();
  await expect(page.locator('#speed-two')).toHaveText('0');
  await expect(page.locator('#lap-tag-two')).toHaveText('Lap 1 / 3');
  await page.keyboard.press('Escape');
  await expect(page.locator('#recover')).toBeHidden();
  await expect(page.locator('#recover-two')).toBeHidden();
  await page.locator('#garage-button').click();
  await page.locator('#assist').check();
  await page.locator('#start').click();
  await expect(page.locator('#recover')).toBeHidden();
  await expect(page.locator('#recover-two')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a two-lap race shows the second lap before celebrating and replay resets the counter', async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto('/city-racers/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  await page.locator('#fewer').click();
  await page.locator('#fewer').click();
  await page.locator('.race-options summary').click();
  await page.locator('#laps').selectOption('2');
  await page.locator('#start').click();
  await page.keyboard.down('ArrowUp');
  await expect(page.locator('#lap-tag')).toHaveText('Lap 2 / 2', {
    timeout: 80000,
  });
  await expect(page.locator('#game')).toHaveAttribute('data-phase', 'racing');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('dialog')).toContainText('Nice driving!', {
    timeout: 70000,
  });
  await page.keyboard.up('ArrowUp');
  await page.locator('#continue').click();
  await expect(page.locator('#lap-tag')).toHaveText('Lap 1 / 2');
  await expect(page.locator('#progress').locator('..')).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
});
