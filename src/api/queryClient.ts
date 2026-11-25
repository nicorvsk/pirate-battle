import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

/** One automatic retry for reads; non-retryable client errors (4xx) are never retried. */
const shouldRetry = (failureCount: number, error: Error): boolean =>
  failureCount < 1 && (error instanceof ApiError ? error.retryable : true);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
    },
  },
});
