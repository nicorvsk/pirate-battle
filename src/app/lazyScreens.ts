import { lazy } from 'react';

/** The match screen carries PixiJS and the simulation, so it loads only when a match starts. */
export const loadMatchScreen = () => import('../screens/MatchScreen');

export const MatchScreen = lazy(() => loadMatchScreen().then((m) => ({ default: m.MatchScreen })));

/** Warms the chunk while the player is still on the menu. Failures are ignored; Play retries it. */
export function preloadMatchScreen(): void {
  const run = () => void loadMatchScreen().catch(() => undefined);
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run);
  else window.setTimeout(run, 1500);
}
