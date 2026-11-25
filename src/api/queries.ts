import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Options } from '../game/options';
import { fetchHistory, fetchRankPosition, fetchRanking } from './client';
import type { MatchRecord, Page, RankPosition, RankingEntry } from './contracts';

export const queryKeys = {
  rankingAll: ['ranking'] as const,
  historyAll: ['history'] as const,
  ranking: (o: Options, page: number) => ['ranking', o.durationSec, o.spawnIntervalSec, page] as const,
  history: (playerId: string, page: number) => ['history', playerId, page] as const,
  rank: (matchId: string) => ['rank', matchId] as const,
};

/**
 * The key contains the page and the configuration, so a late response for an older page or
 * configuration lands in its own cache entry and can never overwrite what is on screen.
 * Superseded requests are also aborted through the AbortSignal.
 */
export function useRankingQuery(options: Options, page: number): UseQueryResult<Page<RankingEntry>, Error> {
  return useQuery<Page<RankingEntry>, Error>({
    queryKey: queryKeys.ranking(options, page),
    queryFn: ({ signal }) => fetchRanking(options, page, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
}

export function useHistoryQuery(playerId: string, page: number): UseQueryResult<Page<MatchRecord>, Error> {
  return useQuery<Page<MatchRecord>, Error>({
    queryKey: queryKeys.history(playerId, page),
    queryFn: ({ signal }) => fetchHistory(playerId, page, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
}

/** Enabled only once the match is saved, because the server cannot rank a match it has not seen. */
export function useRankPositionQuery(matchId: string, enabled: boolean): UseQueryResult<RankPosition, Error> {
  return useQuery<RankPosition, Error>({
    queryKey: queryKeys.rank(matchId),
    queryFn: ({ signal }) => fetchRankPosition(matchId, signal),
    enabled,
  });
}
