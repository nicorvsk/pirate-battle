import type { PlayerInput } from '../sim/types';

const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyD',
  'Space',
  'KeyQ',
  'KeyE',
  'KeyP',
  'Escape',
]);

export class KeyboardInput {
  private down = new Set<string>();
  private onTogglePause: (() => void) | null = null;

  attach(onTogglePause: () => void): void {
    this.onTogglePause = onTogglePause;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.down.clear();
    this.onTogglePause = null;
  }

  reset(): void {
    this.down.clear();
  }

  setKey(code: string, pressed: boolean): void {
    if (pressed) this.down.add(code);
    else this.down.delete(code);
  }

  read(): PlayerInput {
    const d = this.down;
    const left = d.has('ArrowLeft') || d.has('KeyA');
    const right = d.has('ArrowRight') || d.has('KeyD');
    return {
      forward: d.has('ArrowUp') || d.has('KeyW'),
      turn: left === right ? 0 : left ? -1 : 1,
      fireFront: d.has('Space'),
      fireLeft: d.has('KeyQ'),
      fireRight: d.has('KeyE'),
    };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!GAME_KEYS.has(e.code)) return;
    const t = e.target;
    if (t instanceof HTMLElement) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (t.tagName === 'BUTTON' && e.code === 'Space') return;
    }
    e.preventDefault();
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (!e.repeat) this.onTogglePause?.();
      return;
    }
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
}
