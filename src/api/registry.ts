import { MutationObserver, type QueryClient } from '@tanstack/react-query';
import { readJson, writeJson } from '../storage/localStore';
import { isMatchResult, type MatchResult } from '../storage/persistence';
import { ApiError, postMatch } from './client';
import type { MatchRecord, RegisterResponse } from './contracts';
import { queryClient } from './queryClient';
import { queryKeys } from './queries';

const KEY = 'pirate-battle:pending';
const PLAYER_NAME = 'You';

export type RegStatus = 'queued' | 'sending' | 'failed' | 'saved';

export interface PendingItem {
  record: MatchResult;
  attempts: number;
  lastError: string | null;
}

export interface RegistrySnapshot {
  pending: ReadonlyArray<PendingItem>;
  statuses: Readonly<Record<string, RegStatus>>;
}

function loadPending(): PendingItem[] {
  const v = readJson(KEY);
  if (!Array.isArray(v)) return [];
  const items: PendingItem[] = [];
  for (const raw of v as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const i = raw as Record<string, unknown>;
    if (!isMatchResult(i.record) || typeof i.attempts !== 'number') continue;
    items.push({
      record: i.record,
      attempts: i.attempts,
      lastError: typeof i.lastError === 'string' ? i.lastError : null,
    });
  }
  return items;
}

const toRecord = (r: MatchResult): MatchRecord => ({
  matchId: r.matchId,
  playerId: r.playerId,
  playerName: PLAYER_NAME,
  finishedAt: r.finishedAt,
  score: r.score,
  playedMs: r.playedMs,
  endReason: r.endReason,
  options: r.options,
});

/**
 * Tracks finished matches until the server confirms them.
 * - The pending list is persisted, so a refresh or a failure never loses a match.
 * - One request per matchId at a time; repeated clicks reuse the in-flight promise.
 * - The server is idempotent on matchId, so a re-send after a timeout cannot duplicate the record.
 */
export class MatchRegistry {
  private readonly qc: QueryClient;
  private items: PendingItem[];
  private statuses: Record<string, RegStatus> = {};
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly listeners = new Set<() => void>();
  private snapshot: RegistrySnapshot;

  constructor(qc: QueryClient) {
    this.qc = qc;
    this.items = loadPending();
    this.snapshot = { pending: this.items, statuses: this.statuses };
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): RegistrySnapshot => this.snapshot;

  /** Adds a finished match to the persistent queue (no-op if it is already there). */
  enqueue(result: MatchResult): void {
    if (this.items.some((i) => i.record.matchId === result.matchId)) return;
    this.items = [...this.items, { record: result, attempts: 0, lastError: null }];
    this.persist();
    this.emit();
  }

  /** Sends one pending match. Safe to call repeatedly: concurrent calls share one request. */
  submit(matchId: string): Promise<void> {
    const running = this.inflight.get(matchId);
    if (running) return running;
    const item = this.items.find((i) => i.record.matchId === matchId);
    if (!item) return Promise.resolve();

    const run = this.execute(item).finally(() => {
      this.inflight.delete(matchId);
    });
    this.inflight.set(matchId, run);
    return run;
  }

  submitAll(): Promise<void> {
    return Promise.all(this.items.map((i) => this.submit(i.record.matchId))).then(() => undefined);
  }

  /** Demo tool: forgets every pending record and status. */
  reset(): void {
    this.items = [];
    this.statuses = {};
    this.persist();
    this.emit();
  }

  private async execute(item: PendingItem): Promise<void> {
    const id = item.record.matchId;
    this.setStatus(id, 'sending');
    const observer = new MutationObserver<RegisterResponse, Error, MatchRecord>(this.qc, {
      mutationFn: (record) => postMatch(record),
      retry: (failureCount, error) =>
        failureCount < 2 && (error instanceof ApiError ? error.retryable : true),
      retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 2500),
    });
    try {
      await observer.mutate(toRecord(item.record));
      this.items = this.items.filter((i) => i.record.matchId !== id);
      this.persist();
      this.setStatus(id, 'saved');
      void this.qc.invalidateQueries({ queryKey: queryKeys.rankingAll });
      void this.qc.invalidateQueries({ queryKey: queryKeys.historyAll });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error.';
      this.items = this.items.map((i) =>
        i.record.matchId === id ? { ...i, attempts: i.attempts + 1, lastError: message } : i,
      );
      this.persist();
      this.setStatus(id, 'failed');
    }
  }

  private setStatus(id: string, status: RegStatus): void {
    this.statuses = { ...this.statuses, [id]: status };
    this.emit();
  }

  private persist(): void {
    writeJson(KEY, this.items);
  }

  private emit(): void {
    this.snapshot = { pending: this.items, statuses: this.statuses };
    this.listeners.forEach((l) => l());
  }
}

export const registry = new MatchRegistry(queryClient);

/** Status of a match: unknown ids that are no longer pending are considered saved. */
export function statusFor(snap: RegistrySnapshot, matchId: string): RegStatus {
  const known = snap.statuses[matchId];
  if (known) return known;
  return snap.pending.some((i) => i.record.matchId === matchId) ? 'queued' : 'saved';
}
