import type { GameConfig } from './config';
import { audio } from './audio/AudioManager';
import { KeyboardInput } from './input/KeyboardInput';
import { GameRenderer } from './render/GameRenderer';
import { Simulation } from './sim/Simulation';
import type { EndReason, SimEvent, SimState } from './sim/types';

export interface HudSnapshot {
  phase: 'loading' | 'playing' | 'paused' | 'ended';
  pauseReason: 'manual' | 'auto' | null;
  score: number;
  timeLeftSec: number;
  health: number;
  maxHealth: number;
  playedMs: number;
  endReason: EndReason | null;
}

export interface GameTestHook {
  advance(ms: number): void;
  state(): SimState;
  snapshot(): HudSnapshot;
  setKey(code: string, pressed: boolean): void;
  pause(): void;
  resume(): void;
}

declare global {
  interface Window {
    __game?: GameTestHook;
  }
}

export interface ControllerOptions {
  host: HTMLElement;
  config: GameConfig;
  seed: number;
  /** The ticker no longer advances the simulation; tests drive time via `__game.advance()`. */
  manualClock?: boolean;
  exposeTestHook?: boolean;
}

export class GameController {
  private readonly opts: ControllerOptions;
  private readonly sim: Simulation;
  private readonly renderer: GameRenderer;
  private readonly input = new KeyboardInput();
  private readonly listeners = new Set<() => void>();
  private snapshot: HudSnapshot;
  private pauseReason: 'manual' | 'auto' | null = null;
  private ready = false;
  private destroyed = false;
  private hook: GameTestHook | null = null;

  constructor(opts: ControllerOptions) {
    this.opts = opts;
    const cfg = structuredClone(opts.config);
    this.sim = new Simulation(cfg, opts.seed);
    this.renderer = new GameRenderer(opts.host, cfg);
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): HudSnapshot => this.snapshot;

  async init(onProgress: (p: number) => void): Promise<void> {
    await this.renderer.init(onProgress);
    if (this.destroyed) return;

    this.input.attach(() => (this.sim.paused ? this.resume() : this.pause('manual')));
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    this.renderer.onFrame(this.onFrame);
    if (this.opts.exposeTestHook) this.installHook();

    this.ready = true;
    audio.unlock();
    audio.preload();
    audio.startAmbience();
    audio.play('start');
    this.publish();
  }

  pause(reason: 'manual' | 'auto'): void {
    if (!this.ready || this.sim.paused || this.sim.state.status === 'ended') return;
    this.pauseReason = reason;
    this.input.reset();
    this.sim.setPaused(true);
    audio.setAmbiencePaused(true);
    audio.play('pause');
    this.publish();
  }

  /** Requires an explicit player action; held keys and time from the pause are discarded. */
  resume(): void {
    if (!this.ready || !this.sim.paused) return;
    this.pauseReason = null;
    this.input.reset();
    this.sim.setPaused(false);
    audio.setAmbiencePaused(false);
    audio.play('resume');
    this.publish();
  }

  setKey(code: string, pressed: boolean): void {
    if (!this.sim.paused) this.input.setKey(code, pressed);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ready = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    this.input.detach();
    audio.stopAmbience();
    this.renderer.destroy();
    this.listeners.clear();
    if (this.hook && window.__game === this.hook) delete window.__game;
    this.hook = null;
  }

  private onFrame = (deltaMs: number): void => {
    if (!this.ready) return;
    if (this.opts.manualClock) this.flush(deltaMs);
    else this.tick(deltaMs);
  };

  private tick(ms: number): void {
    if (!this.ready) return;
    this.sim.input = this.input.read();
    this.sim.advance(ms);
    this.flush(ms);
  }

  private flush(frameMs: number, events: SimEvent[] = this.sim.drainEvents()): void {
    this.renderer.render(this.sim.state, events, frameMs);
    audio.handle(events);
    this.alerts(events);
    this.publish();
  }

  private lowHealthWarned = false;
  private timeWarned = false;

  /** One-shot warnings: low health (<= 30%) and the last 10 seconds. */
  private alerts(events: readonly { type: string }[]): void {
    const s = this.sim.state;
    const lowHealth = s.player.health > 0 && s.player.health / s.player.maxHealth <= 0.3;
    if (!this.lowHealthWarned && lowHealth && events.some((e) => e.type === 'playerDamaged')) {
      this.lowHealthWarned = true;
      audio.play('healthLow');
    }
    const left = this.sim.cfg.session.durationSec * 1000 - s.elapsedMs;
    if (!this.timeWarned && s.status !== 'ended' && left <= 10_000 && this.sim.cfg.session.durationSec > 10) {
      this.timeWarned = true;
      audio.play('timeWarning');
    }
  }

  private buildSnapshot(): HudSnapshot {
    const s = this.sim.state;
    const durationMs = this.sim.cfg.session.durationSec * 1000;
    const phase: HudSnapshot['phase'] = !this.ready
      ? 'loading'
      : s.status === 'ended'
        ? 'ended'
        : this.sim.paused
          ? 'paused'
          : 'playing';
    return {
      phase,
      pauseReason: phase === 'paused' ? this.pauseReason : null,
      score: s.score,
      timeLeftSec: Math.max(0, Math.ceil((durationMs - s.elapsedMs) / 1000)),
      health: Math.ceil(s.player.health),
      maxHealth: s.player.maxHealth,
      playedMs: Math.round(s.elapsedMs),
      endReason: s.endReason,
    };
  }

  /** Notifies React only when a visible value changed (about once a second), not every frame. */
  private publish(): void {
    const next = this.buildSnapshot();
    const prev = this.snapshot;
    const same = (Object.keys(next) as Array<keyof HudSnapshot>).every((k) => next[k] === prev[k]);
    if (same) return;
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  private onVisibility = (): void => {
    if (document.hidden) this.pause('auto');
  };
  private onBlur = (): void => this.pause('auto');

  private installHook(): void {
    this.hook = {
      advance: (ms) => {
        // Only the last chunks of events reach the renderer, so a whole-match jump stays cheap.
        const recent: SimEvent[][] = [];
        let left = ms;
        while (left > 0) {
          const chunk = Math.min(left, 100);
          this.sim.input = this.input.read();
          this.sim.advance(chunk);
          recent.push(this.sim.drainEvents());
          if (recent.length > 3) recent.shift();
          left -= chunk;
        }
        this.flush(0, recent.flat());
      },
      state: () => structuredClone(this.sim.state),
      snapshot: () => this.snapshot,
      setKey: (code, pressed) => this.setKey(code, pressed),
      pause: () => this.pause('manual'),
      resume: () => this.resume(),
    };
    window.__game = this.hook;
  }
}
