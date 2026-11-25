import type { PointerEvent } from 'react';
import type { GameController } from '../game/GameController';

interface HoldButtonProps {
  ctrl: GameController;
  /** Same key codes as the keyboard, so touch and keyboard share one input pipeline. */
  code: string;
  label: string;
  /** CSS class suffix naming the icon sprite. */
  icon: string;
}

function HoldButton({ ctrl, code, label, icon }: HoldButtonProps) {
  const press = (e: PointerEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    try {
      // Keeps receiving the release even if the finger slides off the button.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // not an active pointer (a synthetic event): pressing still works
    }
    ctrl.setKey(code, true);
  };
  const release = (): void => ctrl.setKey(code, false);

  return (
    <button
      type="button"
      className={`touch-btn icon-${icon}`}
      aria-label={label}
      tabIndex={-1}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

/** Independent hold-buttons: one pointer per button, so moving and firing work at the same time. */
export function TouchControls({ ctrl }: { ctrl: GameController }) {
  return (
    <div className="touch" role="group" aria-label="Touch controls">
      <div className="touch-cluster">
        <HoldButton ctrl={ctrl} code="ArrowLeft" label="Turn left" icon="turn-left" />
        <HoldButton ctrl={ctrl} code="ArrowUp" label="Move forward" icon="forward" />
        <HoldButton ctrl={ctrl} code="ArrowRight" label="Turn right" icon="turn-right" />
      </div>
      <div className="touch-cluster">
        <HoldButton ctrl={ctrl} code="KeyQ" label="Fire left side" icon="fire-left" />
        <HoldButton ctrl={ctrl} code="Space" label="Fire forward" icon="fire-front" />
        <HoldButton ctrl={ctrl} code="KeyE" label="Fire right side" icon="fire-right" />
      </div>
    </div>
  );
}
