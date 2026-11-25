import { hasUrlParam } from '../../utils/urlParams';
import type { SimEvent } from '../sim/types';

const FILES = {
  cannon1: 'cannon_fire_1.wav',
  cannon2: 'cannon_fire_2.wav',
  cannon3: 'cannon_fire_3.wav',
  broadside: 'cannon_broadside.wav',
  water1: 'cannonball_water_hit_1.wav',
  water2: 'cannonball_water_hit_2.wav',
  wood1: 'ship_wood_hit_1.wav',
  wood2: 'ship_wood_hit_2.wav',
  collision: 'ship_collision.wav',
  explosion1: 'ship_explosion_1.wav',
  explosion2: 'ship_explosion_2.wav',
  score: 'score_point.wav',
  start: 'game_start.wav',
  over: 'game_over.wav',
  complete: 'game_complete.wav',
  pause: 'game_pause.wav',
  resume: 'game_resume.wav',
  healthLow: 'health_low.wav',
  timeWarning: 'time_warning.wav',
  click: 'ui_click.wav',
  sinking: 'ship_sinking.wav',
  ocean: 'ocean_ambience_loop.wav',
  music: 'sea_shanty_loop.wav',
} as const;

export type SoundId = keyof typeof FILES;

type LoopId = 'ocean' | 'music';
const LOOP_VOLUME: Record<LoopId, number> = { ocean: 0.25, music: 0.3 };
const LOOPS: readonly LoopId[] = ['ocean', 'music'];

const MUTE_KEY = 'pirate-battle:muted';
/** Stops three broadside shots from stacking into one loud burst. */
const MIN_GAP_MS = 45;

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * WebAudio layer. The context unlocks on the first user gesture (autoplay policy), a missing or
 * blocked sound never throws, and everything is off under `?e2e` unless `?audio` is added.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private readonly loading = new Map<SoundId, Promise<void>>();
  private readonly lastPlayed = new Map<SoundId, number>();
  private readonly loops = new Map<LoopId, AudioBufferSourceNode>();
  private wantAmbience = false;
  private muted = readMuted();
  private cannonTurn = 0;
  private readonly listeners = new Set<() => void>();
  readonly enabled: boolean;

  constructor() {
    this.enabled = typeof AudioContext !== 'undefined' && (!hasUrlParam('e2e') || hasUrlParam('audio'));
    if (this.enabled) {
      const unlock = () => this.unlock();
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock);
      // Touch controls fire on press, so only menu buttons get a click sound.
      document.addEventListener(
        'click',
        (e) => {
          const t = e.target;
          if (t instanceof Element && t.closest('button:not(:disabled):not(.touch-btn)'))
            this.play('click', 0.6);
        },
        true,
      );
    }
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  isMuted = (): boolean => this.muted;

  setMuted(value: boolean): void {
    this.muted = value;
    try {
      window.localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    } catch {
      // the preference just won't persist
    }
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(value ? 0 : 0.8, this.ctx.currentTime, 0.02);
    this.listeners.forEach((l) => l());
  }

  unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.8;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      if (this.wantAmbience) this.startAmbience();
      void this.load('click');
    } catch {
      // audio unsupported or blocked: the game stays silent
    }
  }

  private load(id: SoundId): Promise<void> {
    const existing = this.loading.get(id);
    if (existing) return existing;
    const p = (async () => {
      try {
        if (!this.ctx) return;
        const res = await fetch(`${import.meta.env.BASE_URL}assets/sounds/${FILES[id]}`);
        if (!res.ok) return;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(id, buf);
      } catch {
        this.loading.delete(id);
      }
    })();
    this.loading.set(id, p);
    return p;
  }

  preload(): void {
    if (!this.enabled || !this.ctx) return;
    (Object.keys(FILES) as SoundId[]).forEach((id) => void this.load(id));
  }

  play(id: SoundId, volume = 1, rate = 1): void {
    if (!this.enabled || !this.ctx || !this.master || this.muted) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(id) ?? -1e9) < MIN_GAP_MS) return;
    this.lastPlayed.set(id, now);
    const buf = this.buffers.get(id);
    if (!buf) {
      void this.load(id);
      return;
    }
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(this.master);
      src.start();
    } catch {
      // a failed sound must never affect the game
    }
  }

  /** Starts the background loops: sea ambience and the sea shanty. */
  startAmbience(): void {
    this.wantAmbience = true;
    if (!this.enabled || !this.ctx || !this.master) return;
    for (const id of LOOPS) void this.startLoop(id);
  }

  private async startLoop(id: LoopId): Promise<void> {
    if (this.loops.has(id)) return;
    await this.load(id);
    const buf = this.buffers.get(id);
    if (!buf || !this.ctx || !this.master || !this.wantAmbience || this.loops.has(id)) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = LOOP_VOLUME[id];
      src.connect(gain).connect(this.master);
      src.start();
      this.loops.set(id, src);
    } catch {
      // a failed sound must never affect the game
    }
  }

  stopAmbience(): void {
    this.wantAmbience = false;
    for (const src of this.loops.values()) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    this.loops.clear();
  }

  setAmbiencePaused(paused: boolean): void {
    if (paused) {
      this.stopAmbience();
      this.wantAmbience = true;
    } else if (this.wantAmbience) this.startAmbience();
  }

  handle(events: readonly SimEvent[]): void {
    if (!this.enabled || events.length === 0) return;
    const playerShots = events.filter((e) => e.type === 'shot' && e.owner === 'player').length;
    let shotPlayed = false;
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (e.owner === 'player') {
            if (shotPlayed) break;
            shotPlayed = true;
            if (playerShots >= 2) this.play('broadside', 0.9);
            else this.play((['cannon1', 'cannon2', 'cannon3'] as const)[this.cannonTurn++ % 3], 0.8);
          } else this.play('cannon2', 0.3, 0.9);
          break;
        case 'hit':
          if (e.target === 'island') this.play(this.cannonTurn % 2 ? 'water1' : 'water2', 0.5);
          else if (e.target === 'enemy') this.play(this.cannonTurn % 2 ? 'wood1' : 'wood2', 0.7);
          else this.play('collision', 0.9);
          break;
        case 'explosion':
          this.play(this.cannonTurn % 2 ? 'explosion1' : 'explosion2', 0.9);
          break;
        case 'kill':
          this.play('score', 0.8);
          this.play('sinking', 0.5);
          break;
        case 'ended':
          this.stopAmbience();
          if (e.reason === 'death') this.play('sinking', 0.9);
          this.play(e.reason === 'death' ? 'over' : 'complete', 1);
          break;
        default:
          break;
      }
    }
  }
}

export const audio = new AudioManager();
