import { expect, test } from '@playwright/test';
import { DEFAULT_CONFIG } from '../src/game/config';
import {
  advance,
  cfgParam,
  INVINCIBLE,
  openApp,
  QUIET_ARENA,
  saveOptions,
  startMatch,
  state,
  trace,
} from './helpers';

const { arena, player, islands } = DEFAULT_CONFIG;
const open = (page: Parameters<typeof openApp>[0], overrides: object) => openApp(page, cfgParam(overrides));

test.describe('Movement and terrain', () => {
  test('the player stays inside the arena', async ({ page }) => {
    await open(page, { ...INVINCIBLE, ...QUIET_ARENA, player: INVINCIBLE.player });
    await startMatch(page);
    await page.keyboard.down('ArrowRight'); // turn towards the south wall
    await advance(page, 600);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowUp');
    const samples = await trace(page, 6000);
    await page.keyboard.up('ArrowUp');
    for (const p of samples) {
      expect(p.x).toBeGreaterThanOrEqual(player.radius - 0.01);
      expect(p.x).toBeLessThanOrEqual(arena.width - player.radius + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(player.radius - 0.01);
      expect(p.y).toBeLessThanOrEqual(arena.height - player.radius + 0.01);
    }
    const last = samples[samples.length - 1]!;
    expect(last.y).toBeGreaterThan(arena.height - player.radius - 1.5); // it did reach the wall
  });

  test('the player cannot cross an island', async ({ page }) => {
    await open(page, { ...QUIET_ARENA, player: INVINCIBLE.player });
    await startMatch(page);
    const island = islands[0]!;
    await page.keyboard.down('ArrowUp'); // heading east, straight at the first island
    const samples = await trace(page, 6000);
    await page.keyboard.up('ArrowUp');
    const minGap = island.radius + player.radius;
    for (const p of samples) {
      expect(Math.hypot(p.x - island.x, p.y - island.y)).toBeGreaterThanOrEqual(minGap - 0.5);
    }
    const last = samples[samples.length - 1]!;
    expect(last.x).toBeGreaterThan(island.x - minGap - 8); // it reached the shore
  });
});

test.describe('Weapons', () => {
  test('frontal gun respects its cooldown', async ({ page }) => {
    await open(page, { ...QUIET_ARENA, islands: [], player: INVINCIBLE.player });
    await startMatch(page);
    const mine = async () => (await state(page)).projectiles.filter((p) => p.owner === 'player').length;
    await page.keyboard.down('Space');
    await advance(page, 50);
    expect(await mine()).toBe(1);
    await advance(page, 250); // 300 ms: still cooling down (350 ms)
    expect(await mine()).toBe(1);
    await advance(page, 100); // 400 ms: second shot
    expect(await mine()).toBe(2);
    await page.keyboard.up('Space');
  });

  test('a broadside fires three projectiles per volley and respects its cooldown', async ({ page }) => {
    await open(page, { ...QUIET_ARENA, islands: [], player: INVINCIBLE.player });
    await startMatch(page);
    const mine = async () => (await state(page)).projectiles.filter((p) => p.owner === 'player').length;
    await page.keyboard.down('KeyQ');
    await advance(page, 500);
    expect(await mine()).toBe(3);
    await advance(page, 500); // 1000 ms: first volley expired, cooldown (1200 ms) not over
    expect(await mine()).toBe(0);
    await advance(page, 250); // 1250 ms: second volley
    expect(await mine()).toBe(3);
    await page.keyboard.up('KeyQ');
  });

  test('projectiles hurt a Shooter once each and every kill scores exactly one point', async ({ page }) => {
    await open(page, {
      ...INVINCIBLE,
      islands: [],
      spawn: { chaserWeight: 0, shooterWeight: 1, intervalSec: 2.5 },
    });
    await startMatch(page);
    const result = await page.evaluate(() => {
      const g = window.__game!;
      const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
      const lastHealth = new Map<number, number>();
      let prevScore = 0;
      let maxJump = 0;
      let badHits = 0;
      g.setKey('Space', true);
      for (let i = 0; i < 4000 && g.state().score < 2; i++) {
        const s = g.state();
        const target = s.enemies[0];
        if (target) {
          const diff = wrap(Math.atan2(target.y - s.player.y, target.x - s.player.x) - s.player.angle);
          g.setKey('ArrowRight', diff > 0.03);
          g.setKey('ArrowLeft', diff < -0.03);
        }
        g.advance(20);
        const n = g.state();
        for (const e of n.enemies) {
          const prev = lastHealth.get(e.id);
          if (prev !== undefined && prev - e.health !== 0 && prev - e.health !== 10) badHits++;
          lastHealth.set(e.id, e.health);
        }
        maxJump = Math.max(maxJump, n.score - prevScore);
        prevScore = n.score;
      }
      g.setKey('Space', false);
      g.setKey('ArrowRight', false);
      g.setKey('ArrowLeft', false);
      return { score: g.state().score, maxJump, badHits };
    });
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(result.maxJump).toBe(1); // never two points for one kill
    expect(result.badHits).toBe(0); // each frontal hit removes exactly 10 health
  });
});

test.describe('Enemies', () => {
  test('a Chaser closes in, rams the player for its damage and earns no points', async ({ page }) => {
    await open(page, {
      islands: [],
      player: { maxHealth: 1000 },
      spawn: { chaserWeight: 1, shooterWeight: 0, intervalSec: 10 },
    });
    await startMatch(page);
    const r = await page.evaluate(() => {
      const g = window.__game!;
      const dist: number[] = [];
      let seen = false;
      for (let i = 0; i < 1500; i++) {
        g.advance(50);
        const s = g.state();
        const c = s.enemies[0];
        if (c) {
          seen = true;
          dist.push(Math.hypot(c.x - s.player.x, c.y - s.player.y));
        } else if (seen) break;
      }
      const s = g.state();
      return { dist, health: s.player.health, score: s.score, enemies: s.enemies.length };
    });
    expect(r.dist.length).toBeGreaterThan(5);
    expect(r.dist[r.dist.length - 1]!).toBeLessThan(r.dist[0]!);
    expect(r.health).toBe(1000 - DEFAULT_CONFIG.chaser.collisionDamage);
    expect(r.score).toBe(0);
    expect(r.enemies).toBe(0); // it exploded on impact and left the simulation
  });

  test('a Shooter keeps its distance and only fires inside its attack range', async ({ page }) => {
    const { stopDistance, attackRange, weapon } = DEFAULT_CONFIG.shooter;
    await open(page, {
      islands: [],
      player: { maxHealth: 1000 },
      spawn: { chaserWeight: 0, shooterWeight: 1, intervalSec: 100 },
    });
    await startMatch(page);
    const r = await page.evaluate(() => {
      const g = window.__game!;
      let firstShotDist = -1;
      let minDist = Infinity;
      let lastDist = 0;
      for (let i = 0; i < 600; i++) {
        g.advance(50);
        const s = g.state();
        const e = s.enemies[0];
        if (!e) continue;
        lastDist = Math.hypot(e.x - s.player.x, e.y - s.player.y);
        minDist = Math.min(minDist, lastDist);
        if (firstShotDist < 0 && s.projectiles.some((p) => p.owner === 'enemy')) firstShotDist = lastDist;
      }
      return { firstShotDist, minDist, lastDist, health: g.state().player.health };
    });
    expect(r.firstShotDist).toBeGreaterThan(0);
    expect(r.firstShotDist).toBeLessThanOrEqual(attackRange + 30);
    expect(r.minDist).toBeGreaterThanOrEqual(stopDistance - 10);
    expect(r.lastDist).toBeLessThanOrEqual(stopDistance + 10);
    const lost = 1000 - r.health;
    expect(lost).toBeGreaterThan(0);
    expect(lost % weapon.damage).toBe(0);
  });

  test('enemies spawn at the configured interval, far from the player and clear of islands', async ({
    page,
  }) => {
    await openApp(page, cfgParam(INVINCIBLE));
    await saveOptions(page, '60', '2');
    await page.getByRole('button', { name: 'Back' }).click();
    await startMatch(page);
    const r = await page.evaluate(() => {
      const g = window.__game!;
      const first = new Map<number, { t: number; x: number; y: number; kind: string }>();
      const start = g.state().player;
      for (let i = 0; i < 1500; i++) {
        g.advance(20);
        const s = g.state();
        for (const e of s.enemies)
          if (!first.has(e.id)) first.set(e.id, { t: s.elapsedMs, x: e.x, y: e.y, kind: e.kind });
      }
      return { spawns: [...first.values()], px: start.x, py: start.y };
    });
    expect(r.spawns.length).toBeGreaterThanOrEqual(14);
    expect(r.spawns.length).toBeLessThanOrEqual(16);
    for (let i = 1; i < r.spawns.length; i++) {
      expect(r.spawns[i]!.t - r.spawns[i - 1]!.t).toBeGreaterThanOrEqual(1900);
      expect(r.spawns[i]!.t - r.spawns[i - 1]!.t).toBeLessThanOrEqual(2100);
    }
    for (const sp of r.spawns) {
      expect(Math.hypot(sp.x - r.px, sp.y - r.py)).toBeGreaterThanOrEqual(
        DEFAULT_CONFIG.spawn.minDistanceFromPlayer - 15,
      );
      for (const isl of islands)
        expect(Math.hypot(sp.x - isl.x, sp.y - isl.y)).toBeGreaterThanOrEqual(isl.radius + 20);
    }
    expect(new Set(r.spawns.map((s) => s.kind))).toEqual(new Set(['chaser', 'shooter'])); // both types appear
  });
});

test.describe('End of match and restart', () => {
  test('the end freezes the simulation and Play Again starts a clean match', async ({ page }) => {
    await openApp(page);
    await startMatch(page);
    // One atomic evaluate: the result screen replaces the match shortly after the end, so reading the
    // state in separate round trips would race with it.
    const { ended, later } = await page.evaluate(() => {
      const g = window.__game!;
      g.advance(95_000);
      const first = g.state();
      g.advance(5000);
      return { ended: first, later: g.state() };
    });
    expect(ended.status).toBe('ended');
    expect(later.elapsedMs).toBe(ended.elapsedMs);
    expect(later.score).toBe(ended.score);
    expect(later.player).toEqual(ended.player);
    expect(later.enemies).toEqual(ended.enemies);
    expect(later.projectiles).toEqual(ended.projectiles);

    await expect(page.getByRole('heading', { name: 'Match result' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Play Again' }).click();
    await page.waitForFunction(() => window.__game?.state().status === 'running');
    const fresh = await state(page);
    expect(fresh.elapsedMs).toBe(0);
    expect(fresh.score).toBe(0);
    expect(fresh.player.health).toBe(fresh.player.maxHealth);
    expect(fresh.enemies).toHaveLength(0);
    expect(fresh.projectiles).toHaveLength(0);
    await expect(page.getByRole('group', { name: 'Match status' })).toContainText('Score: 0');
  });
});
