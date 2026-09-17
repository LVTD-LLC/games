// Rebuild the static social preview after editing the game's share.svg.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>body{margin:0}</style>${await readFile('games/corporate-bs-meter/public/share.svg', 'utf8')}`,
  );
  await page.screenshot({ path: 'games/corporate-bs-meter/public/share.png' });
} finally {
  await browser.close();
}
