import { test, expect } from '@playwright/test';

async function enter(page, word) {
  for (const letter of word)
    await page.locator(`[data-key="${letter}"]`).click();
  await page
    .getByRole('button', { name: 'Проверить слово', exact: true })
    .click();
}

test('catalogue navigation, keyboard validation, reload, help and daily win', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-09-11T12:00:00Z'));
  await page.goto('/');
  await page.getByRole('link').filter({ hasText: 'Пять букв' }).click();
  await expect(page).toHaveURL(/\/wordle\/$/);
  await expect(page.getByRole('heading', { name: 'Пять букв.' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Проверить слово', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Нужно пять букв');
  await enter(page, 'ййййй');
  await expect(page.getByRole('status')).toContainText('нет в словаре');
  await expect(page.locator('#attempts')).toHaveText('0 / 6 попыток');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
  // Physical Latin layout maps to Russian СЛОВО.
  await page.keyboard.type('ckjdj');
  await page.keyboard.press('Enter');
  await expect(page.locator('#attempts')).toHaveText('1 / 6 попыток');
  await page.reload();
  await expect(page.locator('#board .row').first()).toHaveText('СЛОВО');
  await page.getByRole('button', { name: 'Как играть', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Е = Ё');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await enter(page, 'рукав');
  await expect(page.locator('#result')).toContainText('Есть! РУКАВ');
  await page.getByRole('button', { name: 'Статистика', exact: true }).click();
  await expect(page.locator('.stats-summary')).toContainText('100%');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.reload();
  await expect(page.locator('#result')).toBeVisible();
  expect(errors).toEqual([]);
});

test('practice has independent saves, loss reveal, sharing fallback and replay', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(
        'lvtd-wordle-v1:practice',
        JSON.stringify({ answer: 'слово', guesses: [] }),
      );
      sessionStorage.setItem('seeded', '1');
    }
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('unavailable')) },
    });
  });
  await page.goto('/wordle/');
  await page.getByRole('button', { name: /Практика/ }).click();
  await enter(page, 'маска');
  await page.getByRole('button', { name: /Слово дня/ }).click();
  await expect(page.locator('#attempts')).toHaveText('0 / 6 попыток');
  await page.getByRole('button', { name: /Практика/ }).click();
  await expect(page.locator('#attempts')).toHaveText('1 / 6 попыток');
  await page.reload();
  await page.getByRole('button', { name: /Практика/ }).click();
  await expect(page.locator('#board .row').first()).toHaveText('МАСКА');
  for (const word of ['парус', 'ветер', 'ручка', 'кошка', 'лампа'])
    await enter(page, word);
  await expect(page.locator('#result')).toContainText(
    'Загаданное слово — СЛОВО',
  );
  await expect(
    page.getByRole('button', { name: 'Проверить слово', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: /Поделиться/ }).click();
  await expect(
    page.getByRole('textbox', { name: 'Результат для копирования' }),
  ).toHaveValue(/X\/6/);
  await expect(
    page.getByRole('textbox', { name: 'Результат для копирования' }),
  ).not.toHaveValue(/СЛОВО|маска/);
  expect(
    await page
      .getByRole('textbox', { name: 'Результат для копирования' })
      .inputValue(),
  ).toContain(new URL('/wordle/', page.url()).href);
  await page.getByRole('button', { name: /Ещё слово/ }).click();
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#attempts')).toHaveText('0 / 6 попыток');
});

test('works with blocked storage, narrow screens and midnight rollover', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  await page.clock.setFixedTime(new Date('2026-09-11T23:59:00Z'));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/wordle/');
  await enter(page, 'слово');
  await expect(page.locator('#attempts')).toHaveText('1 / 6 попыток');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('[data-key="ъ"]')).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-09-12T00:01:00Z'));
  await page.locator('[data-key="а"]').click();
  await expect(page.getByRole('status')).toContainText('новый день');
  await expect(page.locator('#attempts')).toHaveText('0 / 6 попыток');
  await expect(page.locator('#puzzle-label')).toHaveText('12 сентября');
});
