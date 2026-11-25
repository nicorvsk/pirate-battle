import { useState } from 'react';
import { useRankingQuery } from '../api/queries';
import type { Options } from '../game/options';
import { formatDate, formatSeconds } from '../utils/format';
import { PagedQuery } from './PagedQuery';

interface Props {
  options: Options;
  playerId: string;
}

export function RankingPanel({ options, playerId }: Props) {
  const [page, setPage] = useState(1);
  const query = useRankingQuery(options, page);

  return (
    <div className="stack">
      <p className="hint">
        Ranking for your current settings: {options.durationSec}s session, {options.spawnIntervalSec}s spawn
        time. Ties are broken by longer time played, then by earlier finish.
      </p>
      <PagedQuery
        query={query}
        what="ranking"
        emptyText="No matches recorded for these settings yet. Play a match to take the first place."
        page={page}
        onPage={setPage}
      >
        {(items) => (
          <table className="data">
            <caption className="sr-only">Ranking</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Score</th>
                <th scope="col">Time</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => {
                const mine = entry.playerId === playerId;
                return (
                  <tr key={entry.matchId} className={mine ? 'mine' : undefined}>
                    <td>{entry.rank}</td>
                    <td>
                      {entry.playerName}
                      {mine ? ' (you)' : ''}
                    </td>
                    <td>{entry.score}</td>
                    <td>{formatSeconds(entry.playedMs)}</td>
                    <td>{formatDate(entry.finishedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PagedQuery>
    </div>
  );
}
