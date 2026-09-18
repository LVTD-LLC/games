import { test, expect } from '@playwright/test';
import { Chess } from 'chess.js';
const square = (page, name) => page.locator(`[data-square="${name}"]`);
async function move(page, from, to) {
  await square(page, from).click();
  await square(page, to).click();
}
async function saved(page, moves, player = 'w') {
  await page.addInitScript(
    ({ moves, player }) =>
      localStorage.setItem(
        'lvtd-jess-v1:game',
        JSON.stringify({ moves, player }),
      ),
    { moves, player },
  );
}
function answer(body) {
  const chess = new Chess();
  for (const move of body.moves)
    chess.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: move[4],
    });
  const moves = chess.moves({ verbose: true });
  const id = (m) => m.from + m.to + (m.promotion || '');
  return {
    fen: chess.fen(),
    move: id(moves[0]),
    confidence: 1,
    probabilities: moves.map((m, i) => ({
      id: id(m),
      san: m.san,
      probability: i === 0 ? 1 : 0,
    })),
  };
}
test('catalogue, legal user move, real HTTP fixture reply, reload, takeback and narrow layout', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('link').filter({ hasText: 'Jess' }).click();
  await expect(page).toHaveURL(/\/jess\/$/);
  await expect(page.locator('#board button')).toHaveCount(64);
  await page.getByRole('button', { name: 'Play White', exact: true }).click();
  await move(page, 'e2', 'e5');
  await expect(page.locator('#history li')).toHaveCount(0);
  await move(page, 'e2', 'e4');
  await expect(page.locator('#history')).toContainText('e4');
  await expect(page.locator('#history')).toContainText('e5');
  await expect(page.locator('#status')).toHaveText('Your move.');
  await expect(page.locator('#probabilities li')).toHaveCount(3);
  await expect(page.locator('#insight-summary')).toContainText(
    '20 legal moves',
  );
  await page.reload();
  await expect(page.locator('#history')).toContainText('e5');
  await page.getByRole('button', { name: 'Take back' }).click();
  await expect(page.locator('#history li')).toHaveCount(0);
  await square(page, 'e2').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('#history')).toContainText('e3');
  await expect(page.locator('#status')).toHaveText('Your move.');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test('Black waits for Jev to open; board is oriented to the player; random selects a playable side', async ({
  page,
}) => {
  await page.goto('/jess/');
  await page.getByRole('button', { name: 'Play Black', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Your move.');
  await expect(page.locator('#board button').first()).toHaveAttribute(
    'data-square',
    'h1',
  );
  await expect(page.locator('#history')).toContainText('e4');
  await move(page, 'e7', 'e5');
  await expect(page.locator('#ply-count')).toHaveText('3 moves');
  await page.getByRole('button', { name: 'Take back' }).click();
  await expect(page.locator('#ply-count')).toHaveText('1 move');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Start fresh' }).click();
  await page.getByRole('button', { name: 'Surprise me' }).click();
  await expect(page.locator('#status')).toHaveText('Your move.');
  await expect(page.locator('#player-color')).toHaveText(
    /Playing (White|Black)/,
  );
});
test('API errors keep the position, retry recovers, stale replies cannot alter a new game', async ({
  page,
}) => {
  let count = 0;
  await page.route('**/api/jess/move', async (route) => {
    count++;
    if (count === 1)
      return route.fulfill({
        status: 503,
        json: { error: 'Jev is resting. Retry shortly.' },
      });
    await route.fulfill({ json: answer(route.request().postDataJSON()) });
  });
  await page.goto('/jess/');
  await page.getByRole('button', { name: 'Play White', exact: true }).click();
  await move(page, 'e2', 'e4');
  await expect(page.locator('#retry')).toBeVisible();
  await expect(page.locator('#ply-count')).toHaveText('1 move');
  await page.locator('#retry').click();
  await expect(page.locator('#ply-count')).toHaveText('2 moves');
  await page.unroute('**/api/jess/move');
  let release;
  const hold = new Promise((resolve) => (release = resolve));
  let captured;
  await page.route('**/api/jess/move', async (route) => {
    captured = route.request().postDataJSON();
    await hold;
    await route.fulfill({ json: answer(captured) }).catch(() => {});
  });
  await move(page, 'g1', 'f3');
  await expect(page.locator('#status')).toHaveText('Jev is thinking…');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Start fresh' }).click();
  await page.getByRole('button', { name: 'Play White', exact: true }).click();
  release();
  await expect(page.locator('#ply-count')).toHaveText('0 moves');
  await expect(page.locator('#status')).toHaveText('Your move.');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('lvtd-jess-v1:game')).moves,
    ),
  ).toEqual([]);
});
test('promotion offers all pieces and respects underpromotion', async ({
  page,
}) => {
  await saved(page, [
    'a2a4',
    'h7h5',
    'a4a5',
    'h5h4',
    'a5a6',
    'h4h3',
    'a6b7',
    'h3g2',
  ]);
  await page.route('**/api/jess/move', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Paused for promotion test' },
    }),
  );
  await page.goto('/jess/');
  await move(page, 'b7', 'a8');
  await expect(page.locator('#promotion')).toBeVisible();
  await expect(page.locator('[data-promotion]')).toHaveCount(4);
  await page.getByRole('button', { name: 'Knight', exact: true }).click();
  await expect(square(page, 'a8')).toHaveAttribute(
    'aria-label',
    'a8, White knight',
  );
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('lvtd-jess-v1:game')).moves.at(-1),
    ),
  ).toBe('b7a8n');
});
test('castling moves the king and rook together', async ({ page }) => {
  await saved(page, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']);
  await page.route('**/api/jess/move', (route) =>
    route.fulfill({ status: 503, json: { error: 'Paused' } }),
  );
  await page.goto('/jess/');
  await move(page, 'e1', 'g1');
  await expect(square(page, 'g1')).toHaveAttribute(
    'aria-label',
    'g1, White king',
  );
  await expect(square(page, 'f1')).toHaveAttribute(
    'aria-label',
    'f1, White rook',
  );
});
test('en passant removes the captured pawn', async ({ page }) => {
  await saved(page, ['e2e4', 'a7a6', 'e4e5', 'd7d5']);
  await page.route('**/api/jess/move', (route) =>
    route.fulfill({ status: 503, json: { error: 'Paused' } }),
  );
  await page.goto('/jess/');
  await move(page, 'e5', 'd6');
  await expect(square(page, 'd5')).toHaveAttribute('aria-label', 'd5, empty');
  await expect(square(page, 'd6')).toHaveAttribute(
    'aria-label',
    'd6, White pawn',
  );
});
test('checkmate and repetition terminate without further inference', async ({
  browser,
  baseURL,
}) => {
  for (const [moves, expected] of [
    [['f2f3', 'e7e5', 'g2g4', 'd8h4'], 'Checkmate. Jev wins.'],
    [
      ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'],
      'Draw by repetition.',
    ],
  ]) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    let requests = 0;
    await saved(page, moves);
    page.on('request', (req) => {
      if (req.url().includes('/api/jess/')) requests++;
    });
    await page.goto('/jess/');
    await expect(page.locator('#status')).toHaveText(expected);
    await move(page, 'e2', 'e4');
    expect(requests).toBe(0);
    await context.close();
  }
});
