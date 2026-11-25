import {
  compareRecords,
  isMatchRecord,
  paginate,
  sameConfig,
  type MatchRecord,
  type Page,
  type RankPosition,
  type RankingEntry,
} from '../api/contracts';
import type { Options } from '../game/options';
import { readJson, removeKey, writeJson } from '../storage/localStore';
import { fixtureMatches } from './fixtures';
import type { FixtureMode } from './scenarios';

/** The "server" data lives in localStorage, so confirmed records survive refreshes. */
const KEY = 'pirate-battle:mock-db';

interface DbState {
  matches: MatchRecord[];
  /** Matches whose first response the "timeout after register" scenario swallowed. */
  swallowed: string[];
}

function load(): DbState {
  const v = readJson(KEY);
  if (typeof v !== 'object' || v === null) return { matches: [], swallowed: [] };
  const raw = v as Partial<Record<keyof DbState, unknown>>;
  return {
    matches: Array.isArray(raw.matches) ? (raw.matches as unknown[]).filter(isMatchRecord) : [],
    swallowed: Array.isArray(raw.swallowed)
      ? (raw.swallowed as unknown[]).filter((s): s is string => typeof s === 'string')
      : [],
  };
}

const save = (s: DbState): void => {
  writeJson(KEY, s);
};

/** Idempotent on matchId: a repeated POST returns the existing record and creates nothing. */
export function commitMatch(record: MatchRecord): { record: MatchRecord; duplicate: boolean } {
  const state = load();
  const existing = state.matches.find((m) => m.matchId === record.matchId);
  if (existing) return { record: existing, duplicate: true };
  state.matches.push(record);
  save(state);
  return { record, duplicate: false };
}

/** Returns true the first time a matchId is marked (that response is the one to swallow). */
export function markSwallowed(matchId: string): boolean {
  const state = load();
  if (state.swallowed.includes(matchId)) return false;
  state.swallowed.push(matchId);
  save(state);
  return true;
}

function rankedList(options: Options, mode: FixtureMode): RankingEntry[] {
  return [...fixtureMatches(options, mode), ...load().matches.filter((m) => sameConfig(m.options, options))]
    .sort(compareRecords)
    .map((m, i): RankingEntry => ({ ...m, rank: i + 1 }));
}

export function listRanking(
  options: Options,
  page: number,
  pageSize: number,
  mode: FixtureMode,
): Page<RankingEntry> {
  return paginate(rankedList(options, mode), page, pageSize);
}

/** Position of a stored match inside its own configuration's ranking, or null if unknown. */
export function findRankPosition(matchId: string, mode: FixtureMode): RankPosition | null {
  const record = load().matches.find((m) => m.matchId === matchId);
  if (!record) return null;
  const all = rankedList(record.options, mode);
  const entry = all.find((m) => m.matchId === matchId);
  return entry ? { rank: entry.rank, total: all.length, options: record.options } : null;
}

export function listHistory(playerId: string, page: number, pageSize: number): Page<MatchRecord> {
  const mine = load()
    .matches.filter((m) => m.playerId === playerId)
    .sort((a, b) =>
      a.finishedAt === b.finishedAt ? (a.matchId < b.matchId ? 1 : -1) : a.finishedAt < b.finishedAt ? 1 : -1,
    );
  return paginate(mine, page, pageSize);
}

export const resetDb = (): void => removeKey(KEY);
