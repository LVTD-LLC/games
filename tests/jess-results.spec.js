import { isolateJessClient } from './jess-client.mjs';
import { test, expect } from '@playwright/test';
test.beforeEach(isolateJessClient);
test.skip(
  Boolean(process.env.BASE_URL),
  'Uses isolated local game records and deterministic Jev fixture',
);
async function move(page, from, to) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}
async function win(page) {
  await page.goto('/jess/');
  await page.getByRole('button', { name: 'Play White', exact: true }).click();
  for (const [from, to] of [
    ['e2', 'e4'],
    ['f1', 'c4'],
    ['d1', 'h5'],
  ]) {
    await move(page, from, to);
    await expect(page.locator('#status')).toHaveText('Your move.');
  }
  await move(page, 'h5', 'f7');
  await expect(page.locator('#result-dialog')).toBeVisible();
}
test('verified win saves Anonymous automatically, offers optional identity, and updates fastest-win headline', async ({
  page,
}) => {
  await win(page);
  await expect(page.locator('#result-summary')).toContainText('4 moves');
  await expect(page.locator('#result-subscribe')).not.toBeChecked();
  await expect(page.locator('#result-name')).toHaveValue('');
  await expect(page.locator('#result-email')).toHaveValue('');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.locator('#leaderboard')).toContainText('Anonymous');
  await expect(page.locator('#record-challenge')).toContainText(
    'Jev was beaten in 4 moves. Can you do it quicker?',
  );
  await page.reload();
  await expect(page.locator('#result-dialog')).not.toBeVisible();
  await expect(page.locator('#result-save-status')).toContainText(
    'you won in 4 moves',
  );
  await page.getByRole('button', { name: 'Add your name' }).click();
  await page.locator('#result-name').fill('Quick Rook');
  await page.locator('#result-email').fill('rook@example.com');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#identity-error')).toContainText('opt-in');
  await page.locator('#result-subscribe').check();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/jess/identity') && r.status() === 200,
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await saved;
  await expect(page.locator('#result-dialog')).not.toBeVisible();
  await expect(page.locator('#leaderboard')).toContainText('Quick Rook');
  const entries = await (
    await page.request.get('/api/jess/leaderboard')
  ).json();
  expect(JSON.stringify(entries)).not.toContain('rook@example.com');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('checkmate loss records Jev as winner and offers name/email without implying a leaderboard win', async ({
  page,
}) => {
  await page.goto('/jess/');
  await page.getByRole('button', { name: 'Play White', exact: true }).click();
  await move(page, 'f2', 'f3');
  await expect(page.locator('#status')).toHaveText('Your move.');
  await move(page, 'g2', 'g4');
  await expect(page.locator('#result-dialog')).toBeVisible();
  await expect(page.locator('#result-title')).toHaveText('Jev wins.');
  await expect(page.locator('#result-summary')).toContainText('2 moves');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.locator('#result-save-status')).toContainText(
    'Jev won in 2 moves',
  );
  await expect(page.locator('#undo')).toBeDisabled();
});
test('after choosing a side the board has no status card or decorative slogans', async ({
  page,
}) => {
  await page.goto('/jess/');
  await page.getByRole('button', { name: 'Play White', exact: true }).click();
  await expect(page.locator('#setup')).toBeHidden();
  await expect(page.locator('#game-status')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(
    'Chess. With a mind of its own.',
  );
  await expect(page.locator('body')).not.toContainText(
    'You bring the strategy.',
  );
  await expect(page.locator('.eyebrow')).toHaveCount(0);
  await expect(page.locator('#status')).toHaveClass(/sr-only/);
});
