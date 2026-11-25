import { defineConfig, devices } from '@playwright/test';

/** Profiling runs in real time, one at a time, against the production build. Not part of the E2E suite. */
export default defineConfig({
  testDir: './perf',
  timeout: 15 * 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    actionTimeout: 15_000,
    baseURL: 'http://localhost:4174',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 720 },
    // Headed by default: headless Chromium may fall back to software rendering and understate the frame rate.
    headless: process.env.PROFILE_HEADLESS === '1',
    launchOptions: {
      args: [
        '--enable-precise-memory-info',
        '--js-flags=--expose-gc',
        // Keep the page at full speed even if the window is covered or the screen sleeps.
        '--disable-features=CalculateNativeWinOcclusion',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-background-timer-throttling',
      ],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
