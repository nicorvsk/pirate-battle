import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/** Only used to regenerate the README screenshots (docs/img). */
export default defineConfig({
  testDir: './e2e/docs',
  testMatch: '**/*.docs.ts',
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    timezoneId: 'America/Sao_Paulo',
    serviceWorkers: 'allow',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
