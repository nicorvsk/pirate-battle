import { useState, useSyncExternalStore } from 'react';
import type { GameController } from '../game/GameController';
import { isTouchDevice } from '../utils/device';
import { formatClock } from '../utils/format';
import { Dialog } from './Dialog';
import { SoundToggle } from './SoundToggle';
import { TouchControls } from './TouchControls';

const ASSETS = `${import.meta.env.BASE_URL}assets/`;
const LOW_HEALTH = 0.3;
const MID_HEALTH = 0.6;

interface Props {
  ctrl: GameController;
  onQuit: () => void;
}

const statusText = (phase: string): string =>
  phase === 'paused' ? 'Game paused.' : phase === 'ended' ? 'Match ended.' : 'Match in progress.';

export function Hud({ ctrl, onQuit }: Props) {
  const s = useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot);
  const [showTouch] = useState(isTouchDevice);

  const ratio = s.health / s.maxHealth;
  const level = ratio > MID_HEALTH ? 'ok' : ratio > LOW_HEALTH ? 'mid' : 'low';
  const dangerous = s.phase === 'playing' && s.health > 0 && ratio <= LOW_HEALTH;

  return (
    <>
      {/* Screen readers get phase changes only, never per-frame or per-second updates. */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusText(s.phase)}
      </p>

      {dangerous && <div className="hud-vignette" aria-hidden="true" />}

      <div className="hud" role="group" aria-label="Match status">
        <div className="hud-health" style={{ ['--hp' as string]: Math.max(0, ratio) }}>
          <img className="hud-heart" src={`${ASSETS}ui/1x/hud/icon_heart.png`} alt="" aria-hidden="true" />
          <div className="hud-bar" aria-hidden="true">
            <div className="hud-fill" data-level={level} />
            <span>
              {s.health} / {s.maxHealth}
            </span>
          </div>
          <span className="sr-only">
            HP: {s.health}/{s.maxHealth}
          </span>
        </div>

        <div className="hud-right">
          <div className="counter">
            <img src={`${ASSETS}ui/1x/hud/icon_score.png`} alt="" aria-hidden="true" />
            <span aria-hidden="true">{s.score}</span>
            <span className="sr-only">Score: {s.score}</span>
          </div>
          <div className="counter">
            <img src={`${ASSETS}ui/1x/hud/icon_time.png`} alt="" aria-hidden="true" />
            <span aria-hidden="true">{formatClock(s.timeLeftSec)}</span>
            <span className="sr-only">Time: {s.timeLeftSec}s</span>
          </div>
          <button className="hud-pause" onClick={() => ctrl.pause('manual')}>
            <span className="sr-only">Pause</span>
          </button>
        </div>
      </div>

      {!showTouch && (
        <p className="kbd-hint">W/↑ move · A/D or ←/→ turn · Space front · Q left · E right · P/Esc pause</p>
      )}
      <p className="rotate-hint">Rotate your device to landscape for the best view.</p>

      {showTouch && s.phase === 'playing' && <TouchControls ctrl={ctrl} />}

      {s.phase === 'paused' && (
        <Dialog label="Game paused">
          <h2>Paused{s.pauseReason === 'auto' ? ' (focus lost)' : ''}</h2>
          <p>Resume when you are ready. Held keys are discarded.</p>
          <button onClick={() => ctrl.resume()}>Resume</button>
          <SoundToggle />
          <button onClick={onQuit}>Quit to Main Menu</button>
        </Dialog>
      )}
    </>
  );
}
