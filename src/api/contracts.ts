import { isValidOptions, type Options } from '../game/options';
import type { EndReason } from '../game/sim/types';

export const PAGE_SIZE = 10;

/** One finished match, as stored by the (mock) server. `matchId` is the idempotency key. */
export interface MatchRecord {
  matchId: string;
  playerId: string;
  playerName: string;
  finishedAt: string;
  score: number;
  /** Active play time; paused time is not counted. */
  playedMs: number;
  endReason: EndReason;
  options: Options;
}

export interface Page<T> {
  items: T[];
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RankingEntry extends MatchRecord {
  rank: number;
}

/** Where one match sits among all matches played with the same configuration. */
export interface RankPosition {
  rank: number;
  total: number;
  options: Options;
}

/** 201 when the record was created, 200 with duplicate=true when the matchId already existed. */
export interface RegisterResponse {
  record: MatchRecord;
  duplicate: boolean;
}

export interface ApiErrorBody {
  message: string;
}

export const sameConfig = (a: Options, b: Options): boolean =>
  a.durationSec === b.durationSec && a.spawnIntervalSec === b.spawnIntervalSec;

/**
 * Deterministic ranking order (only matches with the same configuration are compared):
 * 1. higher score, 2. longer time played, 3. earlier finish, 4. matchId (total order).
 */
export function compareRecords(a: MatchRecord, b: MatchRecord): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.playedMs !== b.playedMs) return b.playedMs - a.playedMs;
  if (a.finishedAt !== b.finishedAt) return a.finishedAt < b.finishedAt ? -1 : 1;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

export function paginate<T>(all: readonly T[], page: number, pageSize: number): Page<T> {
  const total = all.length;
  const start = (page - 1) * pageSize;
  return {
    items: all.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export function isMatchRecord(v: unknown): v is MatchRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.matchId === 'string' &&
    r.matchId.length > 0 &&
    typeof r.playerId === 'string' &&
    r.playerId.length > 0 &&
    typeof r.playerName === 'string' &&
    typeof r.finishedAt === 'string' &&
    !Number.isNaN(Date.parse(r.finishedAt)) &&
    typeof r.score === 'number' &&
    Number.isInteger(r.score) &&
    r.score >= 0 &&
    typeof r.playedMs === 'number' &&
    Number.isFinite(r.playedMs) &&
    r.playedMs >= 0 &&
    (r.endReason === 'time' || r.endReason === 'death') &&
    isValidOptions(r.options)
  );
}
