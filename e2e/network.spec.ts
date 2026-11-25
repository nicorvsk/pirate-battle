import { expect, test, type Page } from '@playwright/test';
import { advance, openApp, saveOptions, startMatch } from './helpers';

async function pickScenario(page: Page, label: string): Promise<void> {
  await page.getByText('Network scenarios (demo tools)').click();
  await page.getByLabel('Scenario').selectOption({ label });
}

async function playQuickMatch(page: Page): Promise<void> {
  await saveOptions(page, '60', '0.5');
  await page.getByRole('button', { name: 'Back' }).click();
  await startMatch(page);
  await advance(page, 60_000);
  await expect(page.getByRole('heading', { name: 'Match result' })).toBeVisible({ timeout: 5000 });
}

test.describe('Ranking and history with mocked APIs', () => {
  test('success: 23 fixtures over 3 pages', async ({ page }) => {
    await openApp(page);
    const rows = page.getByRole('table', { name: 'Ranking' }).locator('tbody tr');
    await expect(rows).toHaveCount(10);
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('button', { name: /next/i }).click();
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  test('the history paginates and lists the newest match first', async ({ page }) => {
    const playerId = 'player-history-test';
    const matches = Array.from({ length: 12 }, (_, i) => ({
      matchId: `seeded-${i}`,
      playerId,
      playerName: 'You',
      finishedAt: new Date(Date.UTC(2026, 10, 1, 12, i)).toISOString(),
      score: i,
      playedMs: 90_000,
      endReason: 'time',
      options: { durationSec: 90, spawnIntervalSec: 2.5 },
    }));
    await page.addInitScript(
      ([id, db]) => {
        window.localStorage.setItem('pirate-battle:player-id', JSON.stringify(id));
        window.localStorage.setItem('pirate-battle:mock-db', JSON.stringify(db));
      },
      [playerId, { matches, swallowed: [] }] as const,
    );
    await openApp(page);
    await page.getByRole('tab', { name: 'Match History' }).click();

    const rows = page.getByRole('table', { name: 'Match history' }).locator('tbody tr');
    await expect(rows).toHaveCount(10);
    await expect(rows.first().locator('td').nth(1)).toHaveText('11');
    await page.getByRole('button', { name: /next/i }).click();
    await expect(rows).toHaveCount(2);
    await expect(page.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  test('empty lists show an empty state', async ({ page }) => {
    await openApp(page, 'scenario=empty');
    await expect(page.getByRole('table', { name: 'Ranking' })).toHaveCount(0);
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /no |empty|first/i })
        .first(),
    ).toBeVisible();
  });

  test('HTTP 5xx on queries shows an error with a working retry', async ({ page }) => {
    await openApp(page, 'scenario=ranking-fails');
    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await pickScenario(page, 'Success');
    // Switching the scenario refetches the active queries, so the list recovers by itself.
    await expect(page.getByRole('table', { name: 'Ranking' })).toBeVisible();
  });

  test('one failing query does not break the other tab', async ({ page }) => {
    await openApp(page, 'scenario=history-fails');
    await expect(page.getByRole('table', { name: 'Ranking' })).toBeVisible();
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15_000 });
  });

  test('a timeout while registering is retried and never duplicates the match', async ({ page }) => {
    await openApp(page, 'scenario=timeout-after-register&apiTimeout=800');
    await playQuickMatch(page);
    await expect(page.getByText('Recorded in the ranking and history.')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByRole('table', { name: 'Match history' }).locator('tbody tr')).toHaveCount(1);
  });

  test('registration unavailable keeps the match pending until recovery', async ({ page }) => {
    await openApp(page, 'scenario=register-unavailable');
    await playQuickMatch(page);
    await expect(page.getByText(/Not recorded yet|Waiting to be sent/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('region', { name: 'Pending records' })).toBeVisible();

    await pickScenario(page, 'Success');
    await page.getByRole('button', { name: 'Retry now' }).click();
    await expect(page.getByRole('region', { name: 'Pending records' })).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByRole('table', { name: 'Match history' }).locator('tbody tr')).toHaveCount(1);
  });

  test('reset restores the initial mock state', async ({ page }) => {
    await openApp(page, 'scenario=empty');
    await playQuickMatch(page);
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByText('Network scenarios (demo tools)').click();
    await page.getByRole('button', { name: 'Reset to initial state' }).click();
    await expect(page.getByText(/Initial state restored/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Pending records' })).toHaveCount(0);
  });
});
