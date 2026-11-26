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
