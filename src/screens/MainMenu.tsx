import { useState, type KeyboardEvent } from 'react';
import { registry } from '../api/registry';
import { useRegistry } from '../api/useRegistry';
import type { Options } from '../game/options';
import { MOCKS_ENABLED } from '../mocks/enable';
import { getPlayerId, type MatchResult } from '../storage/persistence';
import { formatDate, formatSeconds, reasonLabel } from '../utils/format';
import { HistoryPanel } from '../widgets/HistoryPanel';
import { RankingPanel } from '../widgets/RankingPanel';
import { ScenarioPanel } from '../widgets/ScenarioPanel';
import { SoundToggle } from '../widgets/SoundToggle';

type Tab = 'ranking' | 'history';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
];

const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['W / ↑', 'Move forward'],
  ['A / ←  ·  D / →', 'Rotate left / right'],
  ['Space', 'Fire forward (1 shot)'],
  ['Q  ·  E', 'Broadside left / right (3 shots)'],
  ['P / Esc', 'Pause and resume'],
];

interface Props {
  lastResult: MatchResult | null;
  options: Options;
  onPlay: () => void;
  onOptions: () => void;
}

export function MainMenu({ lastResult, options, onPlay, onOptions }: Props) {
  const [tab, setTab] = useState<Tab>('ranking');
  const [playerId] = useState(getPlayerId);
  const reg = useRegistry();
  const sending = Object.values(reg.statuses).includes('sending');

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next: Tab = tab === 'ranking' ? 'history' : 'ranking';
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <main className="screen">
      <div className="panel panel-wide">
        <h1 className="title">
          <img
            src={`${import.meta.env.BASE_URL}assets/ui/1x/menu/title_pirate_battle.png`}
            alt="Pirate Battle"
            width={384}
            height={128}
          />
        </h1>
        <p className="tagline">Navigate the islands. Survive the battle.</p>

        <div className="row">
          <button autoFocus onClick={onPlay}>
            Play
          </button>
          <button onClick={onOptions}>Options</button>
          <SoundToggle />
        </div>

        {reg.pending.length > 0 && (
          <section className="card" aria-label="Pending records">
            <p role="status">
              {reg.pending.length} finished {reg.pending.length === 1 ? 'match is' : 'matches are'} waiting to
              be registered.
            </p>
            <div className="row">
              <button type="button" disabled={sending} onClick={() => void registry.submitAll()}>
                {sending ? 'Sending…' : 'Retry now'}
              </button>
            </div>
          </section>
        )}

        <section className="card" aria-labelledby="controls-title">
          <h2 id="controls-title">Controls</h2>
          <table className="controls">
            <tbody>
              {CONTROLS.map(([keys, action]) => (
                <tr key={keys}>
                  <th scope="row">{keys}</th>
                  <td>{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            On touch screens, use the on-screen buttons: move and fire can be held together.
          </p>
        </section>

        {lastResult && (
          <section className="card" aria-labelledby="last-title">
            <h2 id="last-title">Last match</h2>
            <p>
              Score {lastResult.score} · {formatSeconds(lastResult.playedMs)} ·{' '}
              {reasonLabel(lastResult.endReason)}
            </p>
            <p className="hint">{formatDate(lastResult.finishedAt)}</p>
          </section>
        )}

        <section className="card wide">
          <div role="tablist" aria-label="Leaderboards" className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={onTabKey}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Only the visible tab is mounted, so showing a tab again always refetches it. */}
          {TABS.map((t) => (
            <div
              key={t.id}
              id={`panel-${t.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${t.id}`}
              hidden={tab !== t.id}
            >
              {tab === t.id &&
                (t.id === 'ranking' ? (
                  <RankingPanel
                    key={`${options.durationSec}-${options.spawnIntervalSec}`}
                    options={options}
                    playerId={playerId}
                  />
                ) : (
                  <HistoryPanel playerId={playerId} />
                ))}
            </div>
          ))}
        </section>

        {MOCKS_ENABLED && <ScenarioPanel />}
      </div>
    </main>
  );
}
