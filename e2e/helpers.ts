import { expect, type Page } from '@playwright/test';

/** Deterministic, fast mocks and a manually driven clock. */
export const E2E = 'e2e&manualClock&mockLatency=0';

export interface Hook {
  advance(ms: number): void;
  state(): {
    status: 'running' | 'ended';
    endReason: 'time' | 'death' | null;
    elapsedMs: number;
    score: number;
    player: { x: number; y: number; angle: number; health: number; maxHealth: number };
    enemies: Array<{ id: number; kind: 'chaser' | 'shooter'; x: number; y: number; health: number }>;
    projectiles: Array<{ owner: 'player' | 'enemy'; x: number; y: number }>;
  };
  snapshot(): { phase: string; score: number; timeLeftSec: number; health: number };
  setKey(code: string, pressed: boolean): void;
  pause(): void;
  resume(): void;
}

declare global {
  interface Window {
    __game?: Hook;
  }
}

export async function openApp(page: Page, params = '', seed = 7): Promise<void> {
  const sep = params ? `&${params}` : '';
  await page.goto(`/?${E2E}&seed=${seed}${sep}`);
  await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
}

export async function startMatch(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForFunction(() => window.__game !== undefined);
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
}

export const advance = (page: Page, ms: number): Promise<void> =>
  page.evaluate((n) => window.__game!.advance(n), ms);

export const state = (page: Page) => page.evaluate(() => window.__game!.state());

export const setKey = (page: Page, code: string, pressed: boolean): Promise<void> =>
  page.evaluate(([c, p]) => window.__game!.setKey(c as string, p as boolean), [code, pressed]);

/** Saves Options through the UI (the same path a player uses). */
export async function saveOptions(page: Page, duration: string, spawn: string): Promise<void> {
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByLabel('Game session time (seconds)').fill(duration);
  await page.getByLabel('Enemy spawn time (seconds)').fill(spawn);
  await page.getByRole('button', { name: 'Save' }).click();
}

/** Encodes a partial configuration for the e2e-only `?cfg=` override. */
export const cfgParam = (overrides: object): string => `cfg=${encodeURIComponent(JSON.stringify(overrides))}`;

/** A player that cannot die: isolates movement and combat tests from incoming damage. */
export const INVINCIBLE = { player: { maxHealth: 1e9 } };

/** No enemy can ever find a spawn point (nothing is farther than 5000 units): a quiet arena. */
export const QUIET_ARENA = { spawn: { minDistanceFromPlayer: 5000 } };

/** Plays an idle match to its end (sunk or time's up) and waits for the result screen. */
export async function playToResult(page: Page): Promise<void> {
  await startMatch(page);
  await advance(page, 95_000);
  await expect(page.getByRole('heading', { name: 'Match result' })).toBeVisible({ timeout: 5000 });
}

/** Advances in small steps and samples the player pose, all inside the page (fast and exact). */
export const trace = (page: Page, totalMs: number, stepMs = 50) =>
  page.evaluate(
    ([total, step]) => {
      const g = window.__game!;
      const out: Array<{ t: number; x: number; y: number }> = [];
      for (let e = 0; e < (total as number); e += step as number) {
        g.advance(step as number);
        const s = g.state();
        out.push({ t: s.elapsedMs, x: s.player.x, y: s.player.y });
      }
      return out;
    },
    [totalMs, stepMs],
  );
