import { expect, test } from '@playwright/test';
import { advance, openApp, saveOptions, setKey, startMatch, state } from './helpers';

test.describe('Gameplay (manual clock, fixed seed)', () => {
  test('time passes only when the test advances it, and the HUD follows', async ({ page }) => {
    await openApp(page);
    await startMatch(page);
    expect((await state(page)).elapsedMs).toBe(0);
    await page.waitForTimeout(300);
    expect((await state(page)).elapsedMs).toBe(0);
    await advance(page, 5000);
    const s = await state(page);
    expect(s.elapsedMs).toBeGreaterThan(4900);
    await expect(page.getByRole('group', { name: 'Match status' })).toContainText(/Time: 8[56]s/);
  });

  test('frontal shot fires one projectile, broadside fires three', async ({ page }) => {
    await openApp(page);
    await startMatch(page);
    await setKey(page, 'Space', true);
    await advance(page, 40);
    await setKey(page, 'Space', false);
    expect((await state(page)).projectiles).toHaveLength(1);

    await advance(page, 2000); // let it expire
    expect((await state(page)).projectiles).toHaveLength(0);

    await setKey(page, 'KeyQ', true);
    await advance(page, 40);
    await setKey(page, 'KeyQ', false);
    expect((await state(page)).projectiles).toHaveLength(3);
  });

  test('forward movement and rotation change the ship pose', async ({ page }) => {
    await openApp(page);
    await startMatch(page);
    const before = (await state(page)).player;
    await setKey(page, 'ArrowUp', true);
    await setKey(page, 'ArrowRight', true);
    await advance(page, 500);
    await setKey(page, 'ArrowUp', false);
    await setKey(page, 'ArrowRight', false);
    const after = (await state(page)).player;
    expect(after.angle).not.toBe(before.angle);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(20);
  });

  test('the same seed and inputs reproduce the same match', async ({ page }) => {
    const run = async (): Promise<unknown> => {
      await openApp(page, '', 42);
      await startMatch(page);
      await setKey(page, 'Space', true);
      await advance(page, 8000);
      await setKey(page, 'Space', false);
      const s = await state(page);
      return { enemies: s.enemies, player: s.player, score: s.score };
    };
    const a = await run();
    const b = await run();
    expect(b).toEqual(a);
  });

  test('manual pause freezes the simulation and resume continues it', async ({ page }) => {
    await openApp(page);
    await startMatch(page);
    await advance(page, 1000);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible();
    const frozen = (await state(page)).elapsedMs;
    await advance(page, 3000);
    expect((await state(page)).elapsedMs).toBe(frozen);
    await page.getByRole('button', { name: 'Resume' }).click();
    await advance(page, 1000);
    expect((await state(page)).elapsedMs).toBeGreaterThan(frozen);
  });

  test('losing focus pauses automatically', async ({ page }) => {
    await openApp(page);
    await startMatch(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toContainText('focus lost');
  });

  test('an idle player is sunk, the result is recorded and appears in ranking and history', async ({
    page,
  }) => {
    await openApp(page, 'scenario=empty');
    await saveOptions(page, '60', '0.5');
    await page.getByRole('button', { name: 'Back' }).click();
    await startMatch(page);
    await advance(page, 60_000);
    expect((await state(page)).status).toBe('ended');
    await expect(page.getByRole('heading', { name: 'Match result' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Recorded in the ranking and history.')).toBeVisible();

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('table', { name: 'Ranking' })).toBeVisible();
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByRole('table', { name: 'Match history' }).locator('tbody tr')).toHaveCount(1);
  });

  test('the match ends by time when the player survives', async ({ page }) => {
    const hp = encodeURIComponent(JSON.stringify({ player: { maxHealth: 1e9 } }));
    await openApp(page, `cfg=${hp}`);
    await startMatch(page);
    await advance(page, 95_000);
    const s = await state(page);
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('time');
    await expect(page.getByText("Time's up")).toBeVisible({ timeout: 5000 });
  });

  test('quitting abandons the match without recording it', async ({ page }) => {
    await openApp(page, 'scenario=empty');
    await startMatch(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Quit to Main Menu' }).click();
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByRole('table', { name: 'Match history' })).toHaveCount(0);
  });
});
