import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import type { Page } from '../api/contracts';
import { Pagination } from './Pagination';

interface Props<T> {
  query: UseQueryResult<Page<T>, Error>;
  /** Noun used in the messages, e.g. "ranking" or "match history". */
  what: string;
  emptyText: string;
  page: number;
  onPage: (page: number) => void;
  children: (items: T[]) => ReactNode;
}

const messageOf = (error: Error | null): string =>
  error instanceof ApiError ? error.message : 'Something went wrong.';

/** Loading, error, empty and data states of a paginated query, with accessible announcements. */
export function PagedQuery<T>({ query, what, emptyText, page, onPage, children }: Props<T>) {
  const { data, isPending, isError, error, isFetching, failureCount, refetch } = query;

  if (isPending) {
    return (
      <p role="status">
        Loading {what}…{failureCount > 0 ? ` retrying (attempt ${failureCount + 1})` : ''}
      </p>
    );
  }

  if (!data) {
    return (
      <div role="alert" className="stack">
        <p className="error">
          Could not load the {what}. {messageOf(error)}
        </p>
        <button type="button" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      {isError && (
        <p className="error" role="alert">
          Could not refresh the {what}: {messageOf(error)} Showing the last loaded data.{' '}
          <button type="button" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      )}
      {data.total === 0 ? (
        <p className="hint" role="status">
          {emptyText}
        </p>
      ) : (
        <>
          <div className="table-wrap" aria-busy={isFetching}>
            {children(data.items)}
          </div>
          <Pagination page={page} totalPages={data.totalPages} onChange={onPage} />
        </>
      )}
      <p className="hint" role="status">
        {isFetching ? 'Updating…' : ''}
      </p>
    </div>
  );
}
