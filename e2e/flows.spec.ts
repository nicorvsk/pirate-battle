import { expect, test } from '@playwright/test';
import {
  advance,
  cfgParam,
  INVINCIBLE,
  openApp,
  playToResult,
  QUIET_ARENA,
  saveOptions,
  startMatch,
  state,
} from './helpers';

test.describe('Pause, results and navigation', () => {
  test('resuming never replays held keys or paused time', async ({ page }) => {
    await openApp(page, cfgParam({ ...QUIET_ARENA, player: INVINCIBLE.player }));
    await startMatch(page);
    await page.keyboard.down('ArrowUp');
    await advance(page, 300);
    await page.getByRole('button', { name: 'Pause' }).click();
    const paused = await state(page);
    await advance(page, 2000);
    await page.getByRole('button', { name: 'Resume' }).click();
    await advance(page, 500); // the key is still physically down, but its state was discarded
    const after = await state(page);
    await page.keyboard.up('ArrowUp');
    expect(after.player.x).toBeCloseTo(paused.player.x, 1);
    expect(after.elapsedMs - paused.elapsedMs).toBeLessThanOrEqual(520);
  });

  test('the result shows the match outcome and survives a refresh', async ({ page }) => {
    await openApp(page, 'scenario=empty');
    await playToResult(page);
    const score = await page
      .locator('dt', { hasText: 'Total score' })
      .locator('xpath=following-sibling::dd[1]')
      .innerText();
    const played = await page
      .locator('dt', { hasText: 'Time played' })
      .locator('xpath=following-sibling::dd[1]')
      .innerText();
    await expect(
      page.locator('dt', { hasText: 'Ended by' }).locator('xpath=following-sibling::dd[1]'),
    ).toHaveText(/Ship sunk|Time's up/);

    await page.reload();
    const last = page.getByRole('region', { name: 'Last match' });
    await expect(last).toContainText(`Score ${score}`);
    await expect(last).toContainText(played);
  });

  test('the result shows the ranking position of the match', async ({ page }) => {
    await openApp(page, 'scenario=success');
    await playToResult(page);
    await expect(page.getByTestId('rank-position')).toHaveText(/#24 of 24/);
  });

  test('a failing ranking query does not hide the recorded match', async ({ page }) => {
    await openApp(page, 'scenario=ranking-fails');
    await playToResult(page);
    await expect(page.getByText('Recorded in the ranking and history.')).toBeVisible();
    await expect(page.getByTestId('rank-position')).toContainText('Could not load the position', {
      timeout: 15_000,
    });
  });

  test('navigating repeatedly between screens leaks nothing', async ({ page }) => {
    test.setTimeout(120_000); // every cycle loads Pixi and the asset pack again (slow under parallel software rendering)
    await openApp(page);
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Options' }).click();
      await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
      await page.getByRole('button', { name: 'Back' }).click();
      await startMatch(page);
      await page.getByRole('button', { name: 'Pause' }).click();
      await page.getByRole('button', { name: 'Quit to Main Menu' }).click();
      await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      expect(await page.evaluate(() => window.__game === undefined)).toBe(true);
    }
  });
});

test.describe('Registration and consistency', () => {
  test('a pending record survives a refresh and is registered once after recovery', async ({ page }) => {
    await openApp(page, 'scenario=register-unavailable');
    await playToResult(page);
    await expect(page.getByText(/Not recorded yet|Waiting to be sent/)).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByRole('region', { name: 'Pending records' })).toBeVisible();

    await page.getByText('Network scenarios (demo tools)').click();
    await page.getByLabel('Scenario').selectOption({ label: 'Success' });
    // After the reload the app already retries on its own: either that attempt succeeds now that the
    // scenario is Success, or the Retry button is there to press. Both end with the queue empty.
    const retry = page.getByRole('button', { name: 'Retry now' });
    await expect(async () => {
      if (await retry.isVisible()) await retry.click({ timeout: 1000 });
      await expect(page.getByRole('region', { name: 'Pending records' })).toHaveCount(0, { timeout: 1500 });
    }).toPass({ timeout: 25_000 });

    await page.reload(); // nothing is sent twice
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByRole('table', { name: 'Match history' }).locator('tbody tr')).toHaveCount(1);
  });

  test('out-of-order responses never leave stale data on screen', async ({ page }) => {
    await page.goto('/?e2e&seed=7&scenario=out-of-order'); // real mock latencies
    const rows = page.getByRole('table', { name: 'Ranking' }).locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const next = page.getByRole('button', { name: 'Next' });
    const prev = page.getByRole('button', { name: 'Previous' });
    await next.click();
    await next.click();
    await prev.click();
    await next.click();
    await prev.click(); // lands on page 2 while earlier requests are still in flight
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Ranking' }).locator('tbody tr td').first()).toHaveText(
      '11',
      {
        timeout: 15_000,
      },
    );
    await page.waitForTimeout(3000); // let every slow response arrive
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Ranking' }).locator('tbody tr td').first()).toHaveText(
      '11',
    );
  });
});

test('the console stays free of errors across the main flows', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await openApp(page, 'scenario=success');
  await expect(page.getByRole('table', { name: 'Ranking' })).toBeVisible();
  await page.getByRole('tab', { name: 'Match History' }).click();
  await saveOptions(page, '60', '2');
  await page.getByRole('button', { name: 'Back' }).click();
  await playToResult(page);
  await expect(page.getByText('Recorded in the ranking and history.')).toBeVisible();
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
  expect(problems).toEqual([]);
});
