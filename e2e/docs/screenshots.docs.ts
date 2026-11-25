import { devices, expect, test } from '@playwright/test';
import { advance, openApp, playToResult, setKey, startMatch } from '../helpers';

/** Regenerates the README screenshots: `npm run docs:screenshots`. Not part of the E2E suite. */
const OUT = 'docs/img';

test('README screenshots', async ({ page, browser }) => {
  test.setTimeout(120_000);

  await openApp(page, 'scenario=success');
  await expect(page.getByRole('table', { name: 'Ranking' })).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: `${OUT}/menu.png` });

  await page.goto('/?e2e&manualClock&mockLatency=0&seed=11');
  await startMatch(page);
  await setKey(page, 'ArrowUp', true);
  await advance(page, 2500);
  await setKey(page, 'ArrowUp', false);
  await setKey(page, 'Space', true);
  await advance(page, 60);
  await setKey(page, 'Space', false);
  await advance(page, 140);
  await page.screenshot({ path: `${OUT}/arena.png` });

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/paused.png` });

  await openApp(page, 'scenario=success', 11);
  await playToResult(page);
  await expect(page.getByTestId('rank-position')).toContainText('#');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: `${OUT}/result.png` });

  const context = await browser.newContext({
    ...devices['Pixel 7 landscape'],
    baseURL: 'http://localhost:4173',
    locale: 'en-US',
  });
  const phone = await context.newPage();
  await openApp(phone, 'scenario=success', 11);
  await startMatch(phone);
  await setKey(phone, 'ArrowUp', true);
  await advance(phone, 2500);
  await setKey(phone, 'ArrowUp', false);
  await phone.screenshot({ path: `${OUT}/mobile-arena.png` });
  await context.close();
});
