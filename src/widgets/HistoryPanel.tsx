import { useState } from 'react';
import { useHistoryQuery } from '../api/queries';
import { formatDate, formatSeconds, reasonLabel } from '../utils/format';
import { PagedQuery } from './PagedQuery';

export function HistoryPanel({ playerId }: { playerId: string }) {
  const [page, setPage] = useState(1);
  const query = useHistoryQuery(playerId, page);

  return (
    <div className="stack">
      <p className="hint">Your recorded matches, newest first.</p>
      <PagedQuery
        query={query}
        what="match history"
        emptyText="You have no recorded matches yet."
        page={page}
        onPage={setPage}
      >
        {(items) => (
          <table className="data">
            <caption className="sr-only">Match history</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Score</th>
                <th scope="col">Duration</th>
                <th scope="col">Ended by</th>
                <th scope="col">Settings</th>
              </tr>
            </thead>
            <tbody>
              {items.map((match) => (
                <tr key={match.matchId}>
                  <td>{formatDate(match.finishedAt)}</td>
                  <td>{match.score}</td>
                  <td>{formatSeconds(match.playedMs)}</td>
                  <td>{reasonLabel(match.endReason)}</td>
                  <td>
                    {match.options.durationSec}s / {match.options.spawnIntervalSec}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PagedQuery>
    </div>
  );
}
