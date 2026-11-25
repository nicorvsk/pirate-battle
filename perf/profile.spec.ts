import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';

/* eslint-disable @typescript-eslint/no-explicit-any */
const TOUGH = encodeURIComponent(JSON.stringify({ player: { maxHealth: 1e9 } }));

async function heapMB(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  await cdp.detach();
  return usedSize / 1048576;
}

async function startReal(page: Page, spawn: string, duration: string): Promise<void> {
  await page.goto(`/?e2e&seed=5&cfg=${TOUGH}&mockLatency=0`);
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByLabel('Game session time (seconds)').fill(duration);
  await page.getByLabel('Enemy spawn time (seconds)').fill(spawn);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForFunction(() => (window as any).__game !== undefined);
}

/** Starts the in-page sampler: frame times, entity counts and periodic fire/turn input. */
async function installSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const frames: number[] = [];
    const entities: Array<{ t: number; enemies: number; projectiles: number }> = [];
    let last = performance.now();
    const t0 = last;
    const raf = (now: number): void => {
      frames.push(now - last);
      last = now;
      (window as any).__perf.raf = requestAnimationFrame(raf);
    };
    (window as any).__perf = { frames, entities, raf: 0, timer: 0, input: 0 };
    (window as any).__perf.raf = requestAnimationFrame(raf);
    (window as any).__perf.timer = window.setInterval(() => {
      const s = (window as any).__game?.state();
      if (s)
        entities.push({
          t: Math.round((performance.now() - t0) / 1000),
          enemies: s.enemies.length,
          projectiles: s.projectiles.length,
        });
    }, 1000);
    let n = 0;
    (window as any).__perf.input = window.setInterval(() => {
      n++;
      (window as any).__game?.setKey('ArrowUp', n % 8 < 5);
      (window as any).__game?.setKey('ArrowRight', n % 6 < 2);
      (window as any).__game?.setKey('Space', true);
      (window as any).__game?.setKey('KeyQ', n % 4 === 0);
      (window as any).__game?.setKey('KeyE', n % 4 === 2);
    }, 250);
  });
}

const pct = (a: number[], p: number): number => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

for (const scenario of [
  { name: 'default', spawn: '2.5' },
  { name: 'stress', spawn: '0.5' },
]) {
  test(`3-minute run (${scenario.name}, spawn ${scenario.spawn}s): frame rate, frame time and entity counts`, async ({
    page,
  }) => {
    await startReal(page, scenario.spawn, '180');
    const heapStart = await heapMB(page);
    await installSampler(page);
    await page.waitForTimeout(180_000);
    const data = await page.evaluate(() => {
      cancelAnimationFrame((window as any).__perf.raf);
      clearInterval((window as any).__perf.timer);
      clearInterval((window as any).__perf.input);
      return {
        frames: (window as any).__perf.frames as number[],
        entities: (window as any).__perf.entities as Array<{ enemies: number; projectiles: number }>,
      };
    });
    // Cost of the simulation alone: 60 fixed steps (1 s of game time) timed in the page, with the current entity counts.
    const simMsPerStep = await page.evaluate(() => {
      const t = performance.now();
      (window as any).__game.advance(1000);
      return (performance.now() - t) / 60;
    });
    const heapEnd = await heapMB(page);
    const f = data.frames.slice(5);
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    const result = {
      scenario: scenario.name,
      spawnSeconds: scenario.spawn,
      seconds: 180,
      frames: f.length,
      avgFps: +(1000 / avg).toFixed(1),
      frameMs: {
        avg: +avg.toFixed(2),
        p50: +pct(f, 50).toFixed(2),
        p95: +pct(f, 95).toFixed(2),
        p99: +pct(f, 99).toFixed(2),
        max: +Math.max(...f).toFixed(1),
      },
      slowFramesOver33ms: f.filter((x) => x > 33.4).length,
      maxEnemies: Math.max(...data.entities.map((e) => e.enemies)),
      maxProjectiles: Math.max(...data.entities.map((e) => e.projectiles)),
      simMsPerStep: +simMsPerStep.toFixed(3),
      heapMB: { start: +heapStart.toFixed(1), end: +heapEnd.toFixed(1) },
    };
    mkdirSync('docs', { recursive: true });
    writeFileSync(`docs/profile-3min-${scenario.name}.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    expect(f.length).toBeGreaterThan(1000);
  });
}

test('memory over 5 start/quit cycles', async ({ page }) => {
  const rows: Array<{ cycle: number; heapMB: number; canvases: number }> = [];
  await page.goto(`/?e2e&seed=5&cfg=${TOUGH}&mockLatency=0`);
  rows.push({ cycle: 0, heapMB: +(await heapMB(page)).toFixed(1), canvases: 0 });
  for (let i = 1; i <= 5; i++) {
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForFunction(() => (window as any).__game !== undefined);
    await installSampler(page);
    await page.waitForTimeout(20_000);
    await page.evaluate(() => {
      clearInterval((window as any).__perf.timer);
      clearInterval((window as any).__perf.input);
      cancelAnimationFrame((window as any).__perf.raf);
      (window as any).__perf = undefined;
    });
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Quit to Main Menu' }).click();
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
    await page.waitForTimeout(500);
    rows.push({
      cycle: i,
      heapMB: +(await heapMB(page)).toFixed(1),
      canvases: await page.locator('canvas').count(),
    });
  }
  const info = {
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    ramGB: +(os.totalmem() / 2 ** 30).toFixed(1),
    platform: `${os.type()} ${os.release()}`,
    node: process.version,
  };
  writeFileSync('docs/profile-memory.json', JSON.stringify({ info, rows }, null, 2));
  console.log(JSON.stringify({ info, rows }, null, 2));
  expect(rows.every((r) => r.canvases === 0)).toBe(true);
});
