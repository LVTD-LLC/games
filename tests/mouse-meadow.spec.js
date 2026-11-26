import { expect, test } from '@playwright/test';

test('the meadow teaches pointing and clicking and lets a child revisit a lesson', async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/games/');
  await page.getByRole('link').filter({ hasText: 'Мышкина полянка' }).click();
  await expect(page).toHaveURL(/\/mouse-meadow\/$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const pieces = page.locator('[data-piece]');
  await expect(pieces).toHaveCount(3);
  for (const piece of await pieces.all()) {
    if (isMobile) await piece.tap();
    else await piece.hover();
  }
  await expect(page.locator('#count')).toHaveText('3 / 3');
  await page.locator('#advance').click();
  await pieces.first().hover();
  await expect(page.locator('#count')).toHaveText('0 / 3');
  await pieces.first().click({ clickCount: 2 });
  await expect(page.locator('#count')).toHaveText('1 / 3');
  await page.getByRole('button', { name: /Бабочки Двигаем/ }).click();
  await expect(page.locator('#result')).toBeVisible();
  await page.locator('#again').click();
  await expect(page.locator('#count')).toHaveText('0 / 3');
  await page.getByRole('button', { name: 'Родителям' }).click();
  await expect(page.getByRole('dialog').getByRole('link')).toHaveAttribute(
    'href',
    '/games/',
  );
  await page.getByRole('button', { name: 'Продолжить игру' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('berries survive a missed drop and can be collected by dragging or selecting', async ({
  page,
  isMobile,
}) => {
  await page.goto('/mouse-meadow/');
  await page.getByRole('button', { name: /Ягодки Перетаскиваем/ }).click();
  const berries = page.locator('.berry');
  const basket = page.getByRole('button', { name: 'Корзинка' });
  await berries
    .first()
    .dragTo(page.locator('#field'), { targetPosition: { x: 20, y: 30 } });
  await expect(page.locator('#count')).toHaveText('0 / 3');
  await berries.first().dragTo(basket);
  await expect(page.locator('#count')).toHaveText('1 / 3');
  if (isMobile) {
    await berries.nth(1).tap();
    await basket.tap();
  } else {
    await berries.nth(1).focus();
    await page.keyboard.press('Space');
    await basket.focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#count')).toHaveText('2 / 3');
  await berries.last().dragTo(basket);
  await expect(page.locator('#result')).toBeVisible();
  await expect(basket.locator('.berry-in')).toHaveCount(3);
  await page.locator('#again').click();
  await expect(berries.first()).toBeVisible();
  await expect(basket.locator('.berry-in')).toHaveCount(0);
});

test('language changes retain progress and translate the lesson, guide and controls', async ({
  page,
}) => {
  await page.goto('/mouse-meadow/');
  await page.getByRole('button', { name: /Цветочки Учимся/ }).click();
  await page.locator('.bud').first().click();
  await page.getByRole('combobox', { name: 'Язык игры' }).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { name: 'Wake up the flowers' }),
  ).toBeVisible();
  await expect(page.locator('#count')).toHaveText('1 / 3');
  await page.getByRole('button', { name: 'For parents' }).click();
  await expect(page.getByRole('dialog')).toContainText('For keyboard lessons');
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Game language' }),
  ).toHaveValue('en');
  await page.getByRole('combobox').selectOption('ru');
  await expect(page.locator('#choose')).toHaveText('Выбери урок');
});

test('clouds need a sustained press and matching uses the pictured butterfly', async ({
  page,
}) => {
  await page.goto('/mouse-meadow/');
  await page.locator('#language').selectOption('en');
  await page.getByRole('button', { name: /Rainclouds Press/ }).click();
  const cloud = page.getByRole('button', { name: 'Cloud 1', exact: true });
  await cloud.click();
  await expect(page.locator('#count')).toHaveText('0 / 3');
  await cloud.focus();
  await page.keyboard.down('Space');
  await expect(page.locator('#count')).toHaveText('1 / 3');
  await page.keyboard.up('Space');
  await page.getByRole('button', { name: /Find a pair Match/ }).click();
  await page.locator('[data-piece="0"]').click();
  await expect(page.locator('#count')).toHaveText('0 / 3');
  for (const i of [1, 0, 2]) await page.locator(`[data-piece="${i}"]`).click();
  await expect(page.locator('#result')).toBeVisible();
});

test('physical keys act once per press, the chord needs Shift and the guide pauses input', async ({
  page,
}) => {
  await page.goto('/mouse-meadow/');
  await page.locator('#language').selectOption('en');
  const count = page.locator('#count');
  for (const [name, key] of [
    [/Little frog Space/, 'Space'],
    [/Baby chicks Enter/, 'Enter'],
    [/Paw prints Backspace/, 'Backspace'],
  ]) {
    await page.getByRole('button', { name }).click();
    await page.keyboard.press('KeyA');
    await expect(count).toHaveText('0 / 3');
    await page.keyboard.down(key);
    await page.keyboard.down(key);
    await expect(count).toHaveText('1 / 3');
    await page.keyboard.up(key);
    await page.keyboard.press(key);
    await page.keyboard.press(key);
    await expect(page.locator('#result')).toBeVisible();
  }
  await page.getByRole('button', { name: /Kites Shift/ }).click();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+KeyA');
  await expect(count).toHaveText('0 / 3');
  await page.keyboard.press('Shift+ArrowUp');
  await expect(count).toHaveText('1 / 3');
  await page.getByRole('button', { name: 'For parents' }).click();
  await page.keyboard.press('Shift+ArrowUp');
  await expect(count).toHaveText('1 / 3');
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await page.locator('#field').focus();
  await page.keyboard.press('Shift+ArrowUp');
  await expect(count).toHaveText('2 / 3');
});

test('pictured keys offer all four lessons on a touchscreen', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/mouse-meadow/');
  await page.locator('#language').selectOption('en');
  for (const [name, key] of [
    [/Little frog Space/, 'Space'],
    [/Baby chicks Enter/, 'Enter'],
    [/Paw prints Backspace/, 'Backspace'],
    [/Kites Shift/, 'Up arrow'],
  ]) {
    await page.getByRole('button', { name }).tap();
    for (let n = 1; n <= 3; n++) {
      if (key === 'Up arrow')
        await page.getByRole('button', { name: 'Shift', exact: true }).tap();
      await page.getByRole('button', { name: key, exact: true }).tap();
      await expect(page.locator('#count')).toHaveText(n + ' / 3');
    }
    await page.getByRole('button', { name: 'Play again' }).tap();
    await expect(page.locator('#count')).toHaveText('0 / 3');
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
