import { expect, test } from '@playwright/test';
import { advance, openApp, startMatch } from './helpers';

test.describe('Assets and accessibility', () => {
  test('an asset failure shows an error and Retry recovers', async ({ page }) => {
    await openApp(page, 'failAssets=once');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('heading', { name: 'Could not load the game' })).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.waitForFunction(() => window.__game !== undefined);
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('a permanent asset failure can return to the menu', async ({ page }) => {
    await openApp(page, 'failAssets=always');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
  });

  test('the pause dialog traps focus and Escape resumes', async ({ page }) => {
    await openApp(page);
    await startMatch(page);
    await page.keyboard.press('Escape');
    const dialog = page.getByRole('dialog', { name: 'Game paused' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('tabs follow the ARIA pattern with arrow keys', async ({ page }) => {
    await openApp(page);
    const ranking = page.getByRole('tab', { name: 'Ranking' });
    await ranking.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Match History' })).toHaveAttribute('aria-selected', 'true');
  });

  test('React does not re-render per frame: the HUD DOM changes about once per second', async ({ page }) => {
    await openApp(page);
    await startMatch(page);
    await page.evaluate(() => {
      const hud = document.querySelector('.hud')!;
      (window as unknown as { __mut: number }).__mut = 0;
      new MutationObserver((m) => ((window as unknown as { __mut: number }).__mut += m.length)).observe(hud, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    });
    await advance(page, 5000); // ~300 simulation steps
    const mutations = await page.evaluate(() => (window as unknown as { __mut: number }).__mut);
    expect(mutations).toBeLessThan(40);
  });
});
