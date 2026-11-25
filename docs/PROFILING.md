# Performance profiling

## Environment

| Item | Value |
| --- | --- |
| CPU | Intel Core i5-10300H @ 2.50 GHz (8 threads) |
| RAM | 7.8 GB |
| OS | Windows (NT 10.0.26300) |
| Browser | Chromium bundled with Playwright 1.65, headed, window 1280×720, device pixel ratio 1 (the renderer caps its resolution at 2x) |
| Build | Production build served by `vite preview` (same artifact as the deploy) |
| Runner | Node 26, `npm run profile` (`perf/profile.spec.ts`, `playwright.perf.config.ts`) |

Reproduce with `npm run profile` (about 9 minutes). Raw output: `docs/profile-3min-default.json`, `docs/profile-3min-stress.json`, `docs/profile-memory.json`.

## Method

- **Real time, no manual clock.** The page runs normally; an in-page `requestAnimationFrame` loop records every frame delta, and a 1 s timer samples the number of enemies and projectiles from the simulation.
- **Realistic input.** A script holds forward, steers, fires the frontal gun continuously and the broadsides periodically. The player has a very large health pool (test-only `?cfg=` override) so the match lasts the full 180 s and the entity count reflects the spawn rate rather than an early death.
- **Two scenarios**, both with the maximum session time (180 s): _default_ (spawn every 2.5 s) and _stress_ (spawn every 0.5 s, the smallest allowed value).
- **Simulation cost** is measured separately: 60 fixed steps (1 s of game time) timed inside the page at the end of the run, with the entity counts present at that moment.
- **Heap** is the JavaScript heap after a forced garbage collection (Chrome DevTools protocol). GPU memory is not included.
- The browser is started with flags that keep the page at full speed when the window is covered (`CalculateNativeWinOcclusion` disabled, background throttling off). Without them, Windows throttled a covered window to about 1 frame per second and invalidated two runs; those runs are not reported.

## 3-minute run

Measured with the supplied sprite sheets, tile fills and UI sprites (final renderer).

| Metric | Default (spawn 2.5 s) | Stress (spawn 0.5 s) |
| --- | --- | --- |
| Frames measured | 10,796 | 10,596 |
| Average FPS | 60.0 | 58.9 |
| Frame time average | 16.67 ms | 16.98 ms |
| Frame time p50 / p95 / p99 | 16.7 / 16.9 / 17.0 ms | 16.7 / 16.9 / 17.0 ms |
| Longest frame | 18.8 ms | 1,016.7 ms |
| Frames over 33 ms | 0 | 4 |
| Peak enemies on screen | 6 | 105 |
| Peak projectiles on screen | 9 | 85 |
| Simulation cost per fixed step | 0.003 ms | 0.057 ms |
| JS heap, start → end | 7.2 → 8.9 MB | 7.1 → 10.7 MB |

The default run never leaves the 16.67 ms display refresh (60 Hz): no frame over 19 ms in 3 minutes, so the game is limited by the monitor, not the CPU. The stress run, with about 105 enemies and 85 projectiles alive, still has p99 at 17.0 ms. It had four frames over 33 ms, one of them a stall of about 1 s; the other 10,592 frames are on the refresh. That stall was not investigated further (it is a single event in 3 minutes, with a heap that keeps growing by only 3.6 MB), so it is reported as measured rather than explained. The simulation costs under 0.06 ms per step even at that load.

## Memory over 5 start/quit cycles

Each cycle starts a match, plays 20 s with the same scripted input, pauses, quits to the main menu and forces garbage collection before reading the heap.

| After cycle | JS heap | Canvases in the DOM |
| --- | --- | --- |
| 0 (menu, before any match) | 3.5 MB | 0 |
| 1 | 7.4 MB | 0 |
| 2 | 7.8 MB | 0 |
| 3 | 7.9 MB | 0 |
| 4 | 8.1 MB | 0 |
| 5 | 8.2 MB | 0 |

The jump from cycle 0 to 1 is the one-time cost of loading PixiJS and slicing the supplied sprite sheets into textures. After that the heap grows by 0.4, 0.1, 0.2 and 0.1 MB per cycle, which points to caches settling rather than a leak, and no canvas is left behind after any quit, which confirms that the renderer, its listeners and its textures are released. Five cycles are a short window; a longer soak test would be the next step to rule out very slow growth.

## Findings and decisions

- **No per-frame React work.** The HUD changes about once per second; an E2E test fails if its DOM mutates more than 40 times in 5 s of game time.
- **Pooled objects.** Projectile sprites, health bars and effect objects are pooled; textures are sliced from the sheets once and shared.
- **Fixed time step with a frame clamp** (100 ms) keeps the simulation stable after a stall: a long frame never causes a burst of catch-up work.
- **Bundle.** The production build warns about a chunk above 500 kB, mostly PixiJS. It loads once and is cached; splitting the game from the menus is a possible optimisation if first-load time matters.

## Limitations

- One machine, one browser, one display refresh rate (60 Hz). Higher refresh-rate displays and low-end mobile hardware were not measured.
- Heap numbers cover the JS heap only (no GPU or native memory).
- The stress scenario peaked at about 110 enemies; with an invincible player that is the highest load a 0.5 s spawn time produced in these runs.
