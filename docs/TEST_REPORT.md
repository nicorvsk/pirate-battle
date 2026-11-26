# Test report

## How to run

```bash
npm run test:e2e:install   # once: downloads Chromium
npm run test:e2e:update    # once: creates the visual baselines (commit e2e/__screenshots__)
npm run test:e2e           # builds, serves the production build and runs everything
npm run test:e2e:report    # opens the HTML report (playwright-report/), traces included
```

The suite runs against `vite build` + `vite preview`, the same artifact that is deployed, with the mock service worker active. Two projects run every test: **desktop** (Chromium, 1280×720) and **mobile** (Chromium, Pixel 7 landscape). Traces are kept for failed tests (`trace: retain-on-failure`), screenshots on failure.

## Determinism

- The simulation is driven by `window.__game.advance(ms)` (exposed only with `?e2e`) and `?manualClock`, so no test depends on real time or frame rate.
- `?seed=<n>` fixes the random generator; `?mockLatency=0` makes the mocked API instant; `?cfg=<json>` (e2e only) adjusts the match configuration, for example to make the player survive to test the time limit.
- A test that depends on a seed replays the same match twice and compares the full state.

## Coverage

| Spec | Tests | What it verifies |
| --- | --- | --- |
| `combat.spec.ts` | 9 | Arena bounds and island collision, frontal cooldown, broadside volley and cooldown, damage and one point per kill, Chaser ramming, Shooter range, spawn interval and placement, frozen simulation after the end and a clean Play Again |
| `flows.spec.ts` | 8 | Pause without replaying held keys or paused time, result after a refresh, ranking position on the result screen, a failing rank query that keeps the match recorded, repeated navigation without leaks, pending record kept across a refresh and registered once, out-of-order responses, console free of errors |
| `options.spec.ts` | 3 | Range validation with accessible errors, persistence after reload, reset to defaults |
| `gameplay.spec.ts` | 9 | Manual clock, frontal (1) and broadside (3) shots, movement and rotation, seeded reproducibility, manual and automatic pause, end by sinking and by time, result registration, quitting without recording |
| `network.spec.ts` | 8 | Ranking pagination (23 fixtures, 3 pages), history pagination (12 matches, newest first), empty state, 5xx with recovery, isolated history failure, timeout after registering without duplicates, registration unavailable then retry, reset |
| `a11y-and-assets.spec.ts` | 5 | Asset failure with Retry and return to menu, dialog focus trap and Escape, ARIA tab keyboard pattern, HUD updated about once per second (no per-frame React renders) |
| `touch.spec.ts` | 1 | Independent hold-buttons move and fire |
| `visual.spec.ts` | 5 | Menu, options error, arena at a fixed seed and time, result screen, pause dialog |

Total: 48 tests × 2 projects = **96 test runs**.

## Visual regression

Baselines live in `e2e/__screenshots__/<project>/<spec>/` and are versioned. Tolerance: 1 % of pixels (`maxDiffPixelRatio`), animations disabled; the date column of the menu is masked. To accept an intentional visual change, run `npm run test:e2e:update` and review the image diff in the commit.

## Results

| Run | Result |
| --- | --- |
| First full run (29 tests, procedural art) | 54 passed, 4 failed. Two assertions in the tests themselves (the HUD rounds the remaining time up, and a retry click assumed a button that disappears on its own); both corrected. 58 passed afterwards. |
| After adopting the supplied art and sounds, 45 tests | 73 passed, 17 failed. 10 were the expected visual diffs (baselines regenerated); the rest were real: a 95 s `advance()` handed the renderer thousands of effects at once, so the result screen replaced the match before the test could read its state. |
| Fixes | The test hook now renders only the last 300 ms of events of a long jump; the end-of-match pause is 2.5 s under `?e2e`; the Pixi resolution is capped at 2x; a registration test no longer races the app's own retry; the end-of-match test reads its states in one atomic `evaluate`; the repeated-navigation test uses 3 cycles and a 120 s limit (each cycle reloads Pixi and the asset pack). |
| After the folder reorganisation, game feedback, rank position and code splitting (47 tests) | Baseline regeneration run: 93 passed, 1 timed out (the pending-record test hit its 60 s limit while 4 workers competed for CPU). |
| History pagination test added | `npx playwright test network`: 16 passed (8 tests × 2 projects). |
| **Final full run (2026-11-26)** | **96 passed, 0 failed, 0 flaky, 6.0 min, 4 workers** (48 tests × desktop and mobile). `typecheck`, `lint` and `build` are clean. |

Under 4 parallel workers with software rendering, a few tests take 40 s or more. They are slow rather than flaky, but the pending-record test did time out once in a run that regenerated baselines and passed in the next full run, so on a loaded machine use `--workers=2`. Running a subset (`npx playwright test flows`) is much faster.

## Known gaps

- The service-worker mocks are verified through the Playwright Chromium projects; other browsers are out of scope (the task asks for Chromium).
- Real-time behaviour (frame pacing, memory) is measured separately, see [PROFILING.md](./PROFILING.md).
