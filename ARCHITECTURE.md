# Architecture

## Overview

```
React (menus, HUD, dialogs)          PixiJS (arena)
        │  external store (≈1 update/s)     ▲ render(state, events)
        ▼                                   │
   GameController ──advance(ms)──► Simulation (pure TS, seeded, fixed step)
        ▲                                   │
 KeyboardInput / TouchControls ◄── same input pipeline (setKey)

React ── TanStack Query ── Axios ──► /api ──► MSW service worker (handlers + localStorage "DB")
```

Folders: `src/app` (shell, lazy screens), `src/screens` (pages), `src/widgets` (reusable UI), `src/game` (config, options, controller, `sim/`, `render/`, `input/`, `audio/`), `src/api` (client, queries, registry), `src/mocks` (scenarios, handlers, DB), `src/storage`, `src/utils`, `src/styles`, `e2e/`. Dependencies point one way: screens and widgets use `api`, `game` and `storage`; `sim` imports only `utils`.

## Simulation

- **Pure and deterministic.** `Simulation` has no DOM, Pixi or wall-clock access. State changes only through `advance(frameMs)`, which feeds an accumulator and runs fixed 1/60 s steps (frames are clamped to 100 ms so a background tab cannot cause a huge catch-up). Random numbers come from a seeded `mulberry32`, so seed + inputs reproduce a match exactly. This is what makes the E2E tests reliable.
- **Step order:** cooldowns → player → enemies → projectiles → terrain → projectile hits → ram impacts → spawns → cleanup → end check.
- **Collisions:** everything is a circle (ships, projectiles, islands). Ship–island overlaps are pushed out along the normal, so ships slide along coasts; the player is also clamped to the arena. A projectile is removed the first time it touches a ship (other than its owner's side), an island, the arena edge or the end of its lifetime, and applies its damage exactly once. A Chaser that touches the player deals its collision damage, explodes and awards no point. Destroyed ships leave the collision lists in the same step.
- **Enemy behaviour:** the Chaser steers toward the player at full speed; the Shooter approaches until `stopDistance`, then holds (it keeps moving only if an island blocks its line) and fires when it is inside `attackRange` and facing the player. Both turn at a limited rate and use the island waypoint steering described below.
- **Spawns:** every `intervalSec`, up to `maxAttempts` random positions are tried; a position must be inside the arena margin, clear of islands and of other ships, and at least `minDistanceFromPlayer` away, so an enemy never appears on top of the player. If no position is found, the spawn is retried on the next simulation step instead of being skipped.
- **Events:** the simulation emits events (shot, hit, explosion, kill, playerDamaged, ended) that the renderer and the audio layer drain each frame. State is never read back from the view.
- **Pause:** pausing clears the accumulator and held input, so resuming never replays time or keeps a stuck key. Only active time counts toward the session.

## Rendering (PixiJS)

- **Assets.** `textures.ts` loads the supplied PNG sheets once per match (progress is reported to a visible loading bar) and slices them into shared sub-textures: ship frames by colour and damage row (healthy → damaged → heavy → wreck), tile fills for water, sand, grass, rocks and palms, explosion and fire frames, and the health-bar frame. If any file fails, nothing is created: the loading overlay turns into an error dialog with **Retry** and **Main Menu**, and combat never starts with missing art. `?failAssets=once|always` reproduces this.
- **Scene.** One `Application`, created asynchronously and destroyed safely: if React Strict Mode unmounts before `init` finishes, the late initialisation is torn down instead of leaking a second canvas. Layers: arena (water, islands), ships, projectiles, effects. Ship sprites point up, so they rotate by heading + 90°. Health bars are the supplied frame with a masked fill (green / amber / red) above every ship. Damage changes the ship's frame, hits flash it red, and explosions, muzzle fire and screen shake come from simulation events. Projectile sprites are pooled; bars and effects reuse display objects.
- **Scaling.** A `ResizeObserver` letterboxes the fixed 1280×720 logical arena into the host, with `autoDensity` and a resolution of `min(devicePixelRatio, 2)` (3× phones would pay 2.25× the fill cost for no visible gain). Input coordinates never depend on the canvas: controls are keys and buttons, so the arena bounds are logical.
- **Cleanup.** On unmount the controller removes all listeners, stops the ticker and sound loop, destroys the application and textures, and removes `window.__game`. A test starts and quits repeatedly and checks that no canvas or hook remains; the profiling run measures the heap over five cycles.
- **Game feedback.** Every kill floats a `+1` at the sunk ship (it rises and fades over 0.9 s), and enemies sink with the same sound as the player. Below 30 % health a pulsing red vignette (DOM, `aria-hidden`) frames the arena. Screen shake and the vignette animation are replaced by static versions under `prefers-reduced-motion`.
- **Sound.** `AudioManager` (WebAudio) reacts to the same simulation events as the renderer. It unlocks on the first user gesture, never throws if a file is missing, has a persisted mute toggle and is off under `?e2e`.

## Code splitting

`React.lazy` loads `screens/MatchScreen`, which pulls in PixiJS, the renderer and the simulation (about 330 kB, 100 kB gzipped), so the menu bundle stays small. The chunk is requested while the menu is idle, and again if needed when Play is pressed. A `Suspense` fallback shows a loading overlay. If the chunk cannot be downloaded (offline, stale deploy), an error boundary offers Reload, because `React.lazy` caches a rejected import for the life of the page.

## React ↔ game boundary

React never re-renders per frame. `GameController` is an external store (`subscribe` / `getSnapshot` with `useSyncExternalStore`). It publishes a new HUD snapshot only when a displayed value changes (score, whole seconds left, health, phase), i.e. about once per second. A test asserts this using a `MutationObserver` on the HUD. Screen readers receive only phase changes (`aria-live`), never per-frame text.

## Input

Keyboard and touch share one pipeline: both call `setKey(code, pressed)`. Touch buttons use pointer events with pointer capture, so move and fire work simultaneously and a release is never lost. Keyboard capture exists only between attach and detach, so menus keep normal behaviour. Losing focus or visibility auto-pauses and clears held keys.

## Data layer

- **Axios client** (`src/api/client.ts`): base URL `/api`, configurable timeout, errors normalised into `ApiError` with `kind`, `status` and `retryable` (timeouts, network errors, 5xx and 429 are retryable; 4xx are not).
- **TanStack Query**: query keys include page and configuration, so a page or setting change never shows another list's data. `keepPreviousData` avoids flicker while paging; stale responses arriving out of order are ignored because each key owns its result.
- **Registration** (`MatchRegistry`): the match gets a client-generated `matchId` and is written to a persistent pending list _before_ the first request. At most one request per match is in flight; failures retry up to twice, then stay pending and are retried on startup, on `online`, or manually. The server is idempotent on `matchId`, so a timeout after commit cannot create a duplicate. After success both lists are invalidated.
- **Ranking rule:** only matches with the same configuration are compared; ties break by score ↓, played time ↓, finish time ↑, `matchId`.

### Contracts and endpoints (`src/api/contracts.ts`)

| Endpoint                                                      | Purpose                                                                                                                                                                                        |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/ranking?page&pageSize&durationSec&spawnIntervalSec` | Paginated ranking for one configuration, ordered by the deterministic rule above                                                                                                               |
| `GET /api/players/:playerId/matches?page&pageSize`            | Paginated history of one player, newest first                                                                                                                                                  |
| `GET /api/matches/:matchId/rank`                              | Position of a stored match among all matches with the same configuration (`rank`, `total`, `options`); `404` if the server has not seen it                                                     |
| `POST /api/matches`                                           | Registers a `MatchRecord` (matchId, playerId, date, score, effective play time, end reason, configuration). `201` when created, `200` with `duplicate: true` when the `matchId` already exists |

Responses are typed (`Page<T>`, `RankingEntry`, `RegisterResponse`); the mock server validates every incoming record with `isMatchRecord` and rejects invalid ones with 400.

### Cache and refresh

`staleTime` 10 s, `gcTime` 5 min, refetch on window focus, `refetchOnMount: 'always'` so showing a tab again always refreshes it, and both lists are invalidated after a successful registration. The result screen asks for its rank only once the match is `saved` (key `['rank', matchId]`); a failure there shows a retry without affecting the recorded status. Queries retry once, and only for retryable errors (timeouts, network errors, 5xx, 429), with a short backoff; registration retries up to twice.

### Local persistence

| Key (`localStorage`)                                   | Content                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `pirate-battle:options`                                | The two player options                                                |
| `pirate-battle:last-result`                            | The last finished match (shown on the menu and after a refresh)       |
| `pirate-battle:player-id`                              | Anonymous player id used for the history                              |
| `pirate-battle:pending`                                | Matches not yet confirmed by the API (survive failures and refreshes) |
| `pirate-battle:mock-db`, `pirate-battle:mock-scenario` | Mock server records and the selected scenario                         |
| `pirate-battle:muted`                                  | Sound toggle                                                          |

Every access is wrapped in `try/catch` (private mode, blocked storage), and stored values are validated before use. An abandoned match writes nothing.

## Mocks (MSW)

Handlers run in the page through a service worker, so the same code runs in dev, the Playwright preview build and the Vercel deploy. The "database" is `localStorage`, so data survives reloads, and a scenario (latency profile plus fault injection per endpoint) is selectable at run time. Latency is seeded and scalable (`mockLatency=0` for tests). The `timeout-after-register` scenario commits the match and then never answers, which exercises the idempotency path.

## Testing

Playwright runs against `vite build` + `vite preview` (the deployed artifact), in desktop and mobile-landscape Chromium; every test starts from a fresh browser context. Tests drive time through `window.__game.advance(ms)` with `?e2e&manualClock` and a fixed seed, so outcomes are exact. The hook only observes state and moves the clock: rules, input handling, collisions and rendering are the real ones, and combat tests press real keys or touch buttons. Configuration overrides (`cfg`) exist only behind `?e2e`. Suites: options, gameplay, combat, flows, network scenarios, accessibility/assets, touch and visual regression (baselines versioned in `e2e/__screenshots__`). The HTML report and traces (kept on failure) are in `playwright-report/`; results are in [docs/TEST_REPORT.md](./docs/TEST_REPORT.md).

One detail of the hook: for a long jump (for example a whole 95 s match in one call) only the visual events of the last 300 ms are handed to the renderer, otherwise thousands of effects would be created at once. The simulation result is identical.

## Trade-offs and limitations

- A fixed logical arena keeps gameplay identical on every screen at the cost of letterboxing.
- Enemy steering is deliberately simple: if an island blocks the straight line to the player, the enemy heads to a waypoint beside the nearest blocking island (deterministic, no RNG), then straight to the player. It is not full path-finding; the simulation boundary makes a navigation layer straightforward to add later.
- The mock DB is per browser, which suits a public demo but is not shared between users.
- Sprites come from the supplied sheets: `textures.ts` slices them into sub-textures (ship frames by colour/damage row, tile fills for water/sand/grass/rocks/palms, health-bar frame with a masked fill). Ship sprites point up, so the renderer rotates them by heading + 90°. Audio is a separate WebAudio layer driven by the same simulation events as the renderer.

## Balance decisions

- **Player:** 100 HP, 220 units/s, frontal shot 10 damage every 350 ms, broadside of three parallel shots at 6 damage each every 1.2 s. The broadside is strong at close range but slow to repeat, so it rewards positioning instead of replacing the frontal gun.
- **Chaser:** 20 HP (two frontal hits), 150 units/s (slower than the player, so it can be outrun), 25 damage on impact, which means four rams sink a full-health player. Dying by ramming gives no point, so letting one reach you is never a good trade.
- **Shooter:** 30 HP, 110 units/s, holds at 260 units and fires 8-damage shots every 1.5 s within 380 units. Its shots are slower than the player's (380 vs 520 units/s) and can be dodged or blocked by islands.
- **Spawns:** 60 % Chasers / 40 % Shooters, first enemy after at most 1 s, then every `intervalSec`. The default of 2.5 s gives a steady fight over 90 s. At the smallest allowed interval (0.5 s) the arena gets crowded (about 105 enemies in the stress profile), which is intentional for the stress test; a completely idle player sinks in roughly 13 s at 1.5 s spawns.
- **Islands:** three islands of different sizes break straight lines for both sides and give the player places to hide from Shooters.
- All of these numbers live in `src/game/config.ts`; no system hard-codes them.
