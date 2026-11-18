import { test, expect } from '@playwright/test';
test('catalogue opens Quiz Club with a working logo and keyboard link', async ({
  page,
}) => {
  await page.goto('/games/');
  const link = page.locator('a[href="/quiz-club/"]');
  await expect(link).toBeVisible();
  await expect
    .poll(() =>
      link
        .locator('img')
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'QUIZ CLUB.' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('two devices play a Russian invite round, reconnect, see scores and replay', async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(
    Boolean(process.env.BASE_URL),
    'Full matches use the local fixture.',
  );
  test.setTimeout(65000);
  const other = await browser.newContext({
    baseURL,
    viewport: page.viewportSize(),
  });
  try {
    const guest = await other.newPage();
    await page.goto('/quiz-club/');
    await page.getByLabel('Your name').fill('Alice');
    await page.getByRole('button', { name: 'Create a room' }).click();
    await page.getByLabel('Game language').selectOption('ru');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create a room' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Комната', exact: true }),
    ).toBeVisible();
    await guest.goto(page.url());
    await guest.locator('#name').fill('Борис');
    await guest.locator('#join-form button').click();
    await page.getByRole('button', { name: 'Я готов(а)' }).click();
    await guest.getByRole('button', { name: 'Я готов(а)' }).click();
    for (let index = 0; index < 10; index++) {
      await expect(page.locator('.round-bar')).toContainText(
        `Вопрос ${index + 1}/10`,
      );
      const prompt = await page.locator('.prompt').innerText();
      await expect(guest.locator('.prompt')).toHaveText(prompt);
      await page.locator('.options button').first().click();
      if (index === 0) {
        await page.reload();
        await expect(page.locator('.feedback')).toContainText('Ответ принят');
      }
      await guest.locator('.options button').last().click();
      await expect(page.locator('.feedback')).toContainText('Верный ответ');
    }
    await expect(page.getByText('Итоги игры', { exact: true })).toBeVisible();
    await expect(guest.getByText('Итоги игры', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Сыграть ещё' }).click();
    await guest.getByRole('button', { name: 'Сыграть ещё' }).click();
    await expect(page.locator('.round-bar')).toContainText('Вопрос 1/10');
  } finally {
    await other.close();
  }
});
