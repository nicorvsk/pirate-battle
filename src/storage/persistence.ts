import { DEFAULT_OPTIONS, isValidOptions, type Options } from '../game/options';
import type { EndReason } from '../game/sim/types';
import { readJson, writeJson } from './localStore';

export interface MatchSummary {
  score: number;
  playedMs: number;
  endReason: EndReason;
}

export interface MatchResult extends MatchSummary {
  matchId: string;
  playerId: string;
  finishedAt: string;
  options: Options;
}

const KEYS = {
  options: 'pirate-battle:options',
  lastResult: 'pirate-battle:last-result',
  playerId: 'pirate-battle:player-id',
} as const;

export function isMatchResult(value: unknown): value is MatchResult {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.matchId === 'string' &&
    typeof r.playerId === 'string' &&
    typeof r.finishedAt === 'string' &&
    typeof r.score === 'number' &&
    typeof r.playedMs === 'number' &&
    (r.endReason === 'time' || r.endReason === 'death') &&
    isValidOptions(r.options)
  );
}

export function loadOptions(): Options {
  const stored = readJson(KEYS.options);
  return isValidOptions(stored)
    ? { durationSec: stored.durationSec, spawnIntervalSec: stored.spawnIntervalSec }
    : { ...DEFAULT_OPTIONS };
}

export const saveOptions = (options: Options): boolean => writeJson(KEYS.options, options);

export function loadLastResult(): MatchResult | null {
  const stored = readJson(KEYS.lastResult);
  return isMatchResult(stored) ? stored : null;
}

export const saveLastResult = (result: MatchResult): boolean => writeJson(KEYS.lastResult, result);

function randomId(): string {
  const c = globalThis.crypto;
  return typeof c?.randomUUID === 'function'
    ? c.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const newMatchId = (): string => `match-${randomId()}`;

export function getPlayerId(): string {
  const stored = readJson(KEYS.playerId);
  if (typeof stored === 'string' && stored.length > 0) return stored;
  const id = `player-${randomId()}`;
  writeJson(KEYS.playerId, id);
  return id;
}
