# Pirate Battle

A 2D top-down naval shooter. React renders the menus, PixiJS renders the arena, TanStack Query + Axios talk to a mocked ranking/history API (MSW), and Playwright tests everything end to end.

- Live demo (mocks enabled): https://pirate-battle-lilac.vercel.app
- Architecture and decisions: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Test report and profiling: [docs/TEST_REPORT.md](./docs/TEST_REPORT.md), [docs/PROFILING.md](./docs/PROFILING.md)

## Requirements

- Node.js 20.19+ or 22.12+ (current LTS)
- npm 10+

## Setup

```bash
npm install
npx playwright install chromium   # only needed for the E2E tests
npm run dev                        # http://localhost:5173
```

## Commands

| Command                    | What it does                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`              | Vite dev server with mocks enabled                                                                                     |
| `npm run build`            | Type-check (`tsc -b`) and production build into `dist/`                                                                |
| `npm run preview`          | Serves the production build                                                                                            |
| `npm run lint`             | ESLint                                                                                                                 |
| `npm run typecheck`        | App, Node and E2E type-check (strict)                                                                                  |
| `npm run format`           | Formats the project with Prettier (`format:check` only verifies)                                                       |
| `npm run test:e2e`         | Builds, serves the build and runs Playwright (desktop + mobile Chromium)                                               |
| `npm run test:e2e:update`  | Regenerates the visual baselines in `e2e/__screenshots__`                                                              |
| `npm run test:e2e:report`  | Opens the HTML report (traces are kept for failed tests)                                                               |
| `npm run test:e2e:install` | Downloads the Chromium build used by Playwright                                                                        |
| `npm run profile`          | 3-minute frame-rate runs and the 5-cycle memory check (about 9 minutes, headed Chromium; writes `docs/profile-*.json`) |

## Project structure

```
src/
  app/        App shell and the lazy-loaded match screen
  screens/    Full pages: MainMenu, OptionsScreen, MatchScreen, ResultScreen
  widgets/    Reusable UI: Hud, Dialog, tables, panels, touch controls, rank position
  game/       GameController, config and options
    sim/      Deterministic simulation (no DOM, no Pixi)
    render/   PixiJS renderer and texture slicing
    input/    Keyboard input
    audio/    WebAudio layer
  api/        Axios client, TanStack Query hooks, contracts, match registry
  mocks/      MSW handlers, scenarios, fixtures and the mock database
  storage/    localStorage helpers and persisted state
  utils/      URL params, device checks, math, RNG, formatting
  styles/     CSS split by concern
e2e/          Playwright specs and helpers
```

The match screen (PixiJS and the simulation) is a separate chunk, loaded when the menu is idle or when a match starts.

## Environment variables

| Variable              | Default | Meaning                                                      |
| --------------------- | ------- | ------------------------------------------------------------ |
| `VITE_ENABLE_MOCKS`   | enabled | Set to `false` to disable MSW and call a real `/api` backend |
| `VITE_API_TIMEOUT_MS` | `6000`  | Axios timeout for every request                              |

The mock service worker lives in `public/mockServiceWorker.js` and is served with the app, so the production build (and the Vercel deploy) runs the mocks too.

## How to play

| Keyboard      | Touch                          | Action                                 |
| ------------- | ------------------------------ | -------------------------------------- |
| W / ↑         | Forward arrow button           | Move forward                           |
| A / ← , D / → | Turn-left / turn-right buttons | Rotate                                 |
| Space         | Centre fire button             | Frontal shot (1 projectile)            |
| Q / E         | Left / right broadside buttons | Broadside left / right (3 projectiles) |
| P / Esc       | Round pause button (top right) | Pause and resume                       |

Touch controls appear on touch devices (or with `?touch`). Each button is independent, so you can move and fire at once. **Supported mobile orientation: landscape.** In portrait the game still runs and shows a hint asking to rotate the device; resizing or rotating re-fits the arena without changing any rule. Keyboard keys are captured only while a match is on screen.

Destroy enemies to score (1 point per kill). Chasers ram you; Shooters keep their distance and fire. Islands block ships and projectiles. The match ends when the time runs out or your ship sinks. The match is paused automatically when the tab or window loses focus.

## Gameplay configuration

Player-facing options (Options screen, saved in `localStorage`):

| Option            | Range                       | Default |
| ----------------- | --------------------------- | ------- |
| Game session time | 60–180 s (whole seconds)    | 90 s    |
| Enemy spawn time  | 0.5–10 s (decimals allowed) | 2.5 s   |

Spawn interval: a new enemy appears every _spawn time_ seconds, as long as there is a free position at least 300 units from the player (up to 20 attempts per spawn). The first enemy appears after `min(1 s, interval)`. Types are drawn 60 % Chaser / 40 % Shooter from the seeded random generator.

Every other number (speeds, damage, cooldowns, health, island positions, score) lives in `src/game/config.ts`. A match takes a deep copy of the configuration when it starts, so changing Options never affects a match in progress.

## Ranking and history

- Every finished match is registered with `POST /api/matches` using a client-generated `matchId`, so retries are idempotent. Quitting a match records nothing.
- A match that cannot be registered stays in a persistent pending queue (`localStorage`) and is retried on startup, when the browser goes back online, and through the "Retry now" button.
- Ranking compares only matches played with the same configuration (session time + spawn time). Tie-break: higher score, then longer play time, then earlier finish, then `matchId`.
- Both lists are paginated (10 per page), with loading, empty and error states.

## Mock scenarios

Open **Network scenarios (demo tools)** on the main menu to select a scenario, or use `?scenario=<id>`. The selection persists. **Reset to initial state** clears mock data, scenario and pending records.

| Id                                | Behaviour                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `success`                         | Everything works; 23 fixture players (3 pages)                                        |
| `empty`                           | No fixtures                                                                           |
| `many-pages`                      | 95 fixture players (10 pages)                                                         |
| `slow`                            | 2.5 s per response                                                                    |
| `variable-latency`                | Seeded latency 100 ms – 1.8 s                                                         |
| `out-of-order`                    | Later requests answer before earlier ones                                             |
| `timeout`                         | Ranking and history never answer                                                      |
| `network-error`                   | Every request fails to connect                                                        |
| `http-4xx`                        | Queries 400, registration 422 (not retried)                                           |
| `http-5xx`                        | Everything 503                                                                        |
| `ranking-fails` / `history-fails` | Only that query answers 500                                                           |
| `timeout-after-register`          | The POST is stored but never answers; the retry returns the same record, no duplicate |
| `register-unavailable`            | POST answers 503 until you switch to another scenario, then retry                     |

## URL parameters (demo and tests)

| Parameter                 | Effect                                                      |
| ------------------------- | ----------------------------------------------------------- |
| `scenario=<id>`           | Select a mock scenario                                      |
| `mockLatency=<factor>`    | Multiply mock delays (`0` = instant)                        |
| `mockSeed=<int>`          | Seed for variable latency                                   |
| `apiTimeout=<ms>`         | Override the Axios timeout                                  |
| `seed=<int>`              | Seed for the match random generator                         |
| `touch`                   | Force touch controls                                        |
| `failAssets=once\|always` | Make asset loading fail (to see the error and Retry flow)   |
| `e2e`                     | Expose `window.__game` for tests (and enable `cfg`)         |
| `manualClock`             | With `e2e`: time advances only through `__game.advance(ms)` |
| `cfg=<json>`              | With `e2e`: deep-merge into the match configuration         |

## Assets and licenses

Art and audio come from the `assets/` pack supplied with the challenge (copied to `public/assets/`): ship sprite sheets, tile sheet, UI sprites (panels, buttons, HUD, controls), scene background, the Jungle Gaming logo and the WAV sound effects. They are used as provided and remain the property of their owners; the challenge repository does not include a separate licence file or fonts. No font files are bundled: the UI uses the system font stack (Trebuchet MS / Segoe UI / system-ui), so there is no font licence to carry.

The background music (`sea_shanty_loop.wav`, a 29 s 6/8 sea-shanty loop) is an original composition generated by `tools/generate-music.py`, so it carries no third-party licence; it plays under the sea ambience and stops with the game-over jingle when the ship sinks.

Sound (`src/game/audio/AudioManager.ts`) uses WebAudio. It starts after the first user gesture (browser autoplay policy), reacts to simulation events, has a persisted **Sound: On/Off** toggle (main menu and pause dialog), fails silently if a file cannot be loaded, and is disabled under `?e2e` (add `?audio` to enable it) so automated runs are silent.

## Reproducing failures

| To see                                      | Do this                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Asset loading error and Retry               | Open `/?failAssets=once` (fails once, Retry works) or `/?failAssets=always` (Retry keeps failing, Main Menu still works), then press Play  |
| Pending match and recovery                  | Select `register-unavailable`, finish a match, refresh (the record stays in **Pending records**), switch to `success`, press **Retry now** |
| Timeout after registering, no duplicate     | Select `timeout-after-register`, finish a match, then switch to `success` and retry: one record in ranking and history                     |
| Ranking or history error with working retry | Select `ranking-fails`, `history-fails` or `http-5xx` and press Retry in the failing tab                                                   |
| Out-of-order responses                      | Select `out-of-order` and page quickly through the ranking: the screen always shows the last page requested                                |
| Back to a clean slate                       | **Reset to initial state** in the scenario panel                                                                                           |

## Known limitations

- Enemy navigation is a simple waypoint steer around the nearest blocking island, not full path-finding: in a very tight spot an enemy can still brush an island.
- Balance is tuned for a quick demo (details in ARCHITECTURE.md); a completely idle player sank in about 13 s with a 1.5 s spawn time.
- The mock "server" lives in each browser (`localStorage` + service worker), so the ranking is per browser, not shared between visitors.
- Mobile is supported in landscape; portrait shows a hint instead of a dedicated layout.
- The supplied assets carry no licence file or fonts; see _Assets and licenses_.
