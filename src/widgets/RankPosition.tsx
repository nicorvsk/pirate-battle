import { useRankPositionQuery } from '../api/queries';
import type { RegStatus } from '../api/registry';

interface Props {
  matchId: string;
  status: RegStatus;
}

/** Position of the finished match in the ranking of its configuration. Needs the match to be saved. */
export function RankPosition({ matchId, status }: Props) {
  const query = useRankPositionQuery(matchId, status === 'saved');

  if (status !== 'saved') return <span>Available once the match is recorded.</span>;
  if (query.isPending) return <span>Calculating…</span>;
  if (query.isError || !query.data) {
    return (
      <>
        <span>Could not load the position.</span>{' '}
        <button type="button" onClick={() => void query.refetch()}>
          Retry
        </button>
      </>
    );
  }

  const { rank, total, options } = query.data;
  return (
    <span>
      #{rank} of {total}{' '}
      <span className="hint">
        ({options.durationSec}s session, {options.spawnIntervalSec}s spawn)
      </span>
    </span>
  );
}
