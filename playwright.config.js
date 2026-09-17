import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'node tests/bs-api-fixture.mjs',
        url: 'http://localhost:4173/api/corporate-bs/health',
        reuseExistingServer: !process.env.CI,
      },
});
