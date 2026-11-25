import axios, { isAxiosError } from 'axios';
import type { Options } from '../game/options';
import { urlParam } from '../utils/urlParams';
import {
  PAGE_SIZE,
  type ApiErrorBody,
  type MatchRecord,
  type Page,
  type RankPosition,
  type RankingEntry,
  type RegisterResponse,
} from './contracts';

/** ?apiTimeout=<ms> overrides the timeout (E2E), then VITE_API_TIMEOUT_MS, then 6000. */
function resolveTimeout(): number {
  const fromUrl = Number(urlParam('apiTimeout'));
  if (Number.isFinite(fromUrl) && fromUrl > 0) return fromUrl;
  return Number(import.meta.env.VITE_API_TIMEOUT_MS) || 6000;
}

export type ApiErrorKind = 'timeout' | 'network' | 'http';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /** Timeouts, network failures, 5xx and 429 are worth retrying; other 4xx are not. */
  readonly retryable: boolean;

  constructor(kind: ApiErrorKind, message: string, status: number | null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.retryable = kind !== 'http' || (status !== null && (status >= 500 || status === 429));
  }
}

function toApiError(err: unknown): unknown {
  if (axios.isCancel(err) || !isAxiosError(err)) return err;
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return new ApiError('timeout', 'The request timed out.', null);
  }
  if (!err.response) return new ApiError('network', 'Could not reach the server.', null);
  const body = err.response.data as Partial<ApiErrorBody> | undefined;
  const status = err.response.status;
  return new ApiError('http', body?.message ?? `The server responded with status ${status}.`, status);
}

export const http = axios.create({
  baseURL: '/api',
  timeout: resolveTimeout(),
  headers: { Accept: 'application/json' },
});

http.interceptors.response.use(
  (response) => response,
  (err: unknown) => Promise.reject(toApiError(err)),
);

export async function fetchRanking(
  options: Options,
  page: number,
  signal?: AbortSignal,
): Promise<Page<RankingEntry>> {
  const { data } = await http.get<Page<RankingEntry>>('/ranking', {
    params: {
      durationSec: options.durationSec,
      spawnIntervalSec: options.spawnIntervalSec,
      page,
      pageSize: PAGE_SIZE,
    },
    signal,
  });
  return data;
}

export async function fetchHistory(
  playerId: string,
  page: number,
  signal?: AbortSignal,
): Promise<Page<MatchRecord>> {
  const { data } = await http.get<Page<MatchRecord>>(`/players/${encodeURIComponent(playerId)}/matches`, {
    params: { page, pageSize: PAGE_SIZE },
    signal,
  });
  return data;
}

/** Idempotent: posting the same matchId again returns the existing record (duplicate: true). */
export async function postMatch(record: MatchRecord, signal?: AbortSignal): Promise<RegisterResponse> {
  const { data } = await http.post<RegisterResponse>('/matches', record, { signal });
  return data;
}

export async function fetchRankPosition(matchId: string, signal?: AbortSignal): Promise<RankPosition> {
  const { data } = await http.get<RankPosition>(`/matches/${encodeURIComponent(matchId)}/rank`, { signal });
  return data;
}
