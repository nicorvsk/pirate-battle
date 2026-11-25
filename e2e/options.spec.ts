import { expect, test } from '@playwright/test';
import { openApp, saveOptions } from './helpers';

test.describe('Options', () => {
  test('rejects out-of-range values with accessible errors and keeps the previous ones', async ({ page }) => {
    await openApp(page);
    await saveOptions(page, '59', '2.5');
    await expect(page.getByRole('alert').filter({ hasText: /60/ })).toBeVisible();
    await expect(page.getByLabel('Game session time (seconds)')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('Game session time (seconds)').fill('90');
    await page.getByLabel('Enemy spawn time (seconds)').fill('10.5');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /10/ })).toBeVisible();
  });

  test('accepts the limits and persists across a reload', async ({ page }) => {
    await openApp(page);
    await saveOptions(page, '180', '0.5');
    await expect(page.getByRole('status').filter({ hasText: /saved/i })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Options' }).click();
    await expect(page.getByLabel('Game session time (seconds)')).toHaveValue('180');
    await expect(page.getByLabel('Enemy spawn time (seconds)')).toHaveValue('0.5');
  });

  test('reset restores the defaults', async ({ page }) => {
    await openApp(page);
    await saveOptions(page, '120', '4');
    await page.getByRole('button', { name: 'Reset to defaults' }).click();
    await expect(page.getByLabel('Game session time (seconds)')).toHaveValue('90');
    await expect(page.getByLabel('Enemy spawn time (seconds)')).toHaveValue('2.5');
  });
});
