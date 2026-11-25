import type { RegStatus } from '../api/registry';
import type { MatchResult } from '../storage/persistence';
import { formatSeconds, reasonLabel } from '../utils/format';
import { RankPosition } from '../widgets/RankPosition';

interface Props {
  result: MatchResult;
  status: RegStatus;
  onRetry: () => void;
  onPlayAgain: () => void;
  onMenu: () => void;
}

const STATUS_TEXT: Record<RegStatus, string> = {
  sending: 'Sending to the server…',
  saved: 'Recorded in the ranking and history.',
  failed: 'Not recorded yet. The match is saved on this device and can be sent again.',
  queued: 'Waiting to be sent. The match is saved on this device.',
};

export function ResultScreen({ result, status, onRetry, onPlayAgain, onMenu }: Props) {
  const canRetry = status === 'failed' || status === 'queued';

  return (
    <main className="screen">
      <div className="panel">
        <h1>Match result</h1>
        <section className="card" aria-label="Match summary">
          <dl className="summary">
            <dt>Total score</dt>
            <dd>{result.score}</dd>
            <dt>Time played</dt>
            <dd>{formatSeconds(result.playedMs)}</dd>
            <dt>Ended by</dt>
            <dd>{reasonLabel(result.endReason)}</dd>
            <dt>Ranking position</dt>
            <dd data-testid="rank-position" role="status">
              <RankPosition matchId={result.matchId} status={status} />
            </dd>
            <dt>Record status</dt>
            <dd role="status" data-status={status}>
              {STATUS_TEXT[status]}
            </dd>
          </dl>
          {canRetry && (
            <div className="row">
              <button type="button" onClick={onRetry}>
                Try again
              </button>
            </div>
          )}
        </section>
        <div className="row">
          <button autoFocus onClick={onPlayAgain}>
            Play Again
          </button>
          <button onClick={onMenu}>Main Menu</button>
        </div>
      </div>
    </main>
  );
}
