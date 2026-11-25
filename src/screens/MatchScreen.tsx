import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { GameConfig } from '../game/config';
import { GameController } from '../game/GameController';
import type { MatchSummary } from '../storage/persistence';
import { hasUrlParam, urlParam } from '../utils/urlParams';
import { Dialog } from '../widgets/Dialog';
import { Hud } from '../widgets/Hud';
import { LoadingOverlay } from '../widgets/LoadingOverlay';

/** Lets the final explosion play before the result screen; automated runs get a longer beat. */
const ENDED_DELAY_MS = hasUrlParam('e2e') ? 2500 : 900;

function readSeed(): number {
  const raw = urlParam('seed');
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) ? n >>> 0 : (Math.random() * 2 ** 32) >>> 0;
}

function useFinishWhenEnded(ctrl: GameController, onFinish: (summary: MatchSummary) => void): void {
  const s = useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot);

  useEffect(() => {
    if (s.phase !== 'ended' || !s.endReason) return;
    const summary: MatchSummary = { score: s.score, playedMs: s.playedMs, endReason: s.endReason };
    const timer = window.setTimeout(() => onFinish(summary), ENDED_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [s, onFinish]);
}

function ActiveMatch({ ctrl, onFinish, onQuit }: { ctrl: GameController } & Omit<Props, 'config'>) {
  useFinishWhenEnded(ctrl, onFinish);
  return <Hud ctrl={ctrl} onQuit={onQuit} />;
}

interface Props {
  config: GameConfig;
  onFinish: (summary: MatchSummary) => void;
  onQuit: () => void;
}

export function MatchScreen({ config, onFinish, onQuit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [ctrl, setCtrl] = useState<GameController | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    const controller = new GameController({
      host,
      config,
      seed: readSeed(),
      exposeTestHook: hasUrlParam('e2e'),
      manualClock: hasUrlParam('manualClock'),
    });

    controller
      .init((p) => {
        if (active) setProgress(p);
      })
      .then(() => {
        if (active) setCtrl(controller);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Unknown error');
      });

    return () => {
      active = false;
      setCtrl(null);
      controller.destroy();
    };
  }, [config, attempt]);

  const retry = () => {
    setError(null);
    setProgress(0);
    setCtrl(null);
    setAttempt((n) => n + 1);
  };

  return (
    <main className="game-root" aria-label="Pirate Battle match">
      <div ref={hostRef} className="game-host" />
      {!ctrl && !error && <LoadingOverlay label="Loading assets" progress={progress} />}
      {error && (
        <Dialog label="Loading failed">
          <h2>Could not load the game</h2>
          <p role="alert">{error}</p>
          <button onClick={retry}>Retry</button>
          <button onClick={onQuit}>Main Menu</button>
        </Dialog>
      )}
      {ctrl && <ActiveMatch ctrl={ctrl} onFinish={onFinish} onQuit={onQuit} />}
    </main>
  );
}
