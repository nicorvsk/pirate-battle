import type { MatchRecord } from '../api/contracts';
import type { Options } from '../game/options';
import { createRng } from '../utils/rng';
import type { FixtureMode } from './scenarios';

const NAMES = [
  'Anne Bonny',
  'Calico Jack',
  'Blackbeard',
  'Mary Read',
  'Captain Kidd',
  'Grace OMalley',
  'Henry Morgan',
  'Bartholomew Roberts',
  'Ching Shih',
  'Samuel Bellamy',
  'Stede Bonnet',
  'Jean Lafitte',
  'Francis Drake',
  'Black Caesar',
  'Edward Low',
  'Rachel Wall',
  'Charles Vane',
  'Jacquotte Delahaye',
  'Hornigold',
  'Hayreddin',
  'Piet Heyn',
  'Zheng Yi',
  'Olivier Levasseur',
  'Anne Dieu-le-Veut',
  'Sadie Farrell',
  'Henry Every',
  'John Rackham',
  'Thomas Tew',
  'Lady Killigrew',
  'Maria Lindsey',
];

export const FIXTURE_COUNTS: Record<FixtureMode, number> = { default: 23, many: 95, none: 0 };

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Other players' matches for one configuration. Fully deterministic (seeded by the configuration,
 * fixed dates) so tests and visual baselines never depend on the clock or on Math.random.
 */
export function fixtureMatches(options: Options, mode: FixtureMode): MatchRecord[] {
  const count = FIXTURE_COUNTS[mode];
  const rng = createRng(hash(`${options.durationSec}:${options.spawnIntervalSec}`));
  const fullMs = options.durationSec * 1000;
  const maxScore = Math.max(4, Math.round((options.durationSec / options.spawnIntervalSec) * 0.5));
  const base = Date.UTC(2026, 10, 1, 12, 0, 0);
  const out: MatchRecord[] = [];
  for (let i = 0; i < count; i++) {
    const round = Math.floor(i / NAMES.length);
    const name = round === 0 ? NAMES[i % NAMES.length] : `${NAMES[i % NAMES.length]} ${round + 1}`;
    const survived = rng() < 0.65;
    const score = Math.floor(rng() * maxScore) + 1;
    const playedMs = survived ? fullMs : Math.round(((0.3 + rng() * 0.65) * fullMs) / 100) * 100;
    out.push({
      matchId: `fixture-${options.durationSec}-${options.spawnIntervalSec}-${i}`,
      playerId: `fixture-player-${i}`,
      playerName: name,
      finishedAt: new Date(base + i * 5 * 3_600_000).toISOString(),
      score,
      playedMs,
      endReason: survived ? 'time' : 'death',
      options: { ...options },
    });
  }
  return out;
}
