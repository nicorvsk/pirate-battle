import { expect, test } from '@playwright/test';
import { advance, openApp, saveOptions, setKey, startMatch } from './helpers';

// Baselines: run `npm run test:e2e:update` once and commit e2e/__screenshots__.
test.describe('Visual regression', () => {
  test('main menu', async ({ page }) => {
    await openApp(page, 'scenario=success');
    await expect(page.getByRole('table', { name: 'Ranking' })).toBeVisible();
    await expect(page).toHaveScreenshot('menu.png', { mask: [page.locator('td:last-child')] });
  });

  test('options screen', async ({ page }) => {
    await openApp(page);
    await saveOptions(page, '59', '2.5');
    await expect(page).toHaveScreenshot('options-error.png');
  });

  test('arena at a fixed seed and time', async ({ page }) => {
    await openApp(page, '', 11);
    await startMatch(page);
    await setKey(page, 'ArrowUp', true);
    await advance(page, 1500);
    await setKey(page, 'ArrowUp', false);
    await setKey(page, 'Space', true);
    await advance(page, 60);
    await setKey(page, 'Space', false);
    await advance(page, 140);
    await expect(page.locator('canvas')).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }) => {
    await openApp(page, 'scenario=empty', 11);
    await startMatch(page);
    await advance(page, 95_000);
    await expect(page.getByRole('heading', { name: 'Match result' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Recorded in the ranking and history.')).toBeVisible();
    await expect(page.getByTestId('rank-position')).toContainText('#1 of 1');
    await expect(page).toHaveScreenshot('result.png');
  });

  test('pause dialog', async ({ page }) => {
    await openApp(page, '', 11);
    await startMatch(page);
    await advance(page, 2000);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page).toHaveScreenshot('paused.png');
  });
});
