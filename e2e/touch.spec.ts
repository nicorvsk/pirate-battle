import { expect, test } from '@playwright/test';
import { advance, openApp, startMatch, state } from './helpers';

test.describe('Touch controls', () => {
  test('hold-buttons move the ship and fire, independently', async ({ page }) => {
    await openApp(page, 'touch');
    await startMatch(page);
    await expect(page.getByRole('group', { name: 'Touch controls' })).toBeVisible();
    const before = (await state(page)).player;

    const forward = page.getByRole('button', { name: 'Move forward' });
    const box = (await forward.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await advance(page, 600);
    await page.mouse.up();
    const after = (await state(page)).player;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(30);

    await page.getByRole('button', { name: 'Fire left side' }).dispatchEvent('pointerdown', { pointerId: 9 });
    await advance(page, 40);
    await page.getByRole('button', { name: 'Fire left side' }).dispatchEvent('pointerup', { pointerId: 9 });
    expect((await state(page)).projectiles.length).toBeGreaterThanOrEqual(3);
  });
});
