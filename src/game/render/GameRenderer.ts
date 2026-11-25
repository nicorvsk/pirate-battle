import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TilingSprite,
  type Texture,
  type Ticker,
} from 'pixi.js';
import { prefersReducedMotion } from '../../utils/device';
import type { GameConfig } from '../config';
import type { Projectile, Ship, SimEvent, SimState } from '../sim/types';
import { damageLevel, loadTextures, type TextureSet } from './textures';

interface ShipView {
  node: Container;
  sprite: Sprite;
  fire: Sprite;
  fill: Sprite;
  mask: Graphics;
  ratio: number;
  level: number;
  flashMs: number;
  seen: number;
}

interface Effect {
  g: Container;
  age: number;
  life: number;
  from: number;
  to: number;
  startY: number;
  rise: number;
}

const MAX_EFFECTS = 120;
const SHAKE_MS = 180;
const SHIP_LENGTH_PER_RADIUS = 3.6;
const BAR_WIDTH = 80;
const BAR_LOGICAL_WIDTH = 160;
/** `fill_rect` of enemy_health_frame in ui_sheet.json. */
const BAR_FILL = { x: 24, y: 12, w: 112, h: 15 };
const POPUP_STYLE = {
  fontFamily: 'Trebuchet MS, Segoe UI, system-ui, sans-serif',
  fontSize: 26,
  fontWeight: '800',
  fill: 0xffe08a,
  stroke: { color: 0x3a2200, width: 5 },
} as const;

export class GameRenderer {
  private readonly host: HTMLElement;
  private readonly cfg: GameConfig;
  private app: Application | null = null;
  private textures: TextureSet | null = null;
  private readonly world = new Container();
  private surround: TilingSprite | null = null;
  private simTime = 0;
  private readonly shipLayer = new Container();
  private readonly projLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly ships = new Map<number, ShipView>();
  private readonly projectiles = new Map<number, Sprite>();
  private readonly projPool: Sprite[] = [];
  private effects: Effect[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private tickerFn: ((t: Ticker) => void) | null = null;
  private destroyed = false;
  private frame = 0;
  private shakeMs = 0;
  private baseX = 0;
  private baseY = 0;
  private readonly reducedMotion = prefersReducedMotion();

  constructor(host: HTMLElement, cfg: GameConfig) {
    this.host = host;
    this.cfg = cfg;
  }

  /** Textures load first (cheap to discard on failure). Safe against destroy() mid-init, as Strict Mode does. */
  async init(onProgress: (p: number) => void): Promise<void> {
    const textures = await loadTextures(onProgress);
    if (this.destroyed) {
      textures.destroy();
      return;
    }
    const app = new Application();
    await app.init({
      width: Math.max(1, this.host.clientWidth),
      height: Math.max(1, this.host.clientHeight),
      background: 0x041a28,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    if (this.destroyed) {
      app.destroy({ removeView: true }, { children: true });
      textures.destroy();
      return;
    }

    this.app = app;
    this.textures = textures;
    this.host.appendChild(app.canvas);
    app.canvas.style.display = 'block';
    app.canvas.setAttribute('aria-hidden', 'true');

    // Dimmed water also fills the letterbox bars so the arena edge stays readable.
    this.surround = new TilingSprite({ texture: textures.water, width: 1, height: 1 });
    this.surround.tileScale.set(textures.tileScale);
    this.surround.tint = 0x5d7f99;
    this.world.addChild(this.buildArena(), this.shipLayer, this.projLayer, this.fxLayer);
    app.stage.addChild(this.surround, this.world);

    this.layout();
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.host);
  }

  onFrame(cb: (deltaMs: number) => void): void {
    if (!this.app) return;
    this.tickerFn = (t) => cb(t.deltaMS);
    this.app.ticker.add(this.tickerFn);
  }

  render(state: SimState, events: SimEvent[], frameMs: number): void {
    if (!this.app || !this.textures) return;
    const ms = Math.min(frameMs, 100);
    this.frame += 1;
    this.simTime = state.elapsedMs;

    for (const ev of events) this.handleEvent(ev, state);

    const playerView = this.syncShip(state.player);
    playerView.node.visible = state.player.alive;
    for (const e of state.enemies) this.syncShip(e);
    this.sweepShips();

    this.syncProjectiles(state.projectiles);

    for (const v of this.ships.values()) {
      if (v.flashMs > 0) {
        v.flashMs -= ms;
        v.sprite.tint = v.flashMs > 0 ? 0xff8a80 : 0xffffff;
      }
    }
    this.updateEffects(ms);
    this.updateShake(ms);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.app) {
      if (this.tickerFn) this.app.ticker.remove(this.tickerFn);
      this.app.destroy({ removeView: true }, { children: true });
      this.app = null;
    }
    this.textures?.destroy();
    this.textures = null;
    this.ships.clear();
    this.projectiles.clear();
    this.projPool.length = 0;
    this.effects = [];
  }

  private layout(): void {
    const app = this.app;
    if (!app) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    app.renderer.resize(w, h);
    if (this.surround) {
      this.surround.width = w;
      this.surround.height = h;
    }
    const { width: aw, height: ah } = this.cfg.arena;
    const s = Math.min(w / aw, h / ah);
    this.world.scale.set(s);
    this.baseX = (w - aw * s) / 2;
    this.baseY = (h - ah * s) / 2;
    this.world.position.set(this.baseX, this.baseY);
  }

  private buildArena(): Container {
    const { width: aw, height: ah } = this.cfg.arena;
    const t = this.tex;
    const root = new Container();

    const water = new TilingSprite({ texture: t.water, width: aw, height: ah });
    water.tileScale.set(t.tileScale);
    water.tint = 0xb9d6e0;
    root.addChild(water);

    this.cfg.islands.forEach((isl, i) => {
      const c = new Container();
      c.addChild(
        new Graphics()
          .circle(isl.x, isl.y, isl.radius + 22)
          .fill({ color: 0xbff0f7, alpha: 0.22 })
          .circle(isl.x, isl.y, isl.radius + 11)
          .fill({ color: 0xd6f7fa, alpha: 0.3 }),
      );
      const disc = (radius: number, texture: Texture): void => {
        const sprite = new TilingSprite({ texture, width: radius * 2, height: radius * 2 });
        sprite.tileScale.set(t.tileScale);
        sprite.position.set(isl.x - radius, isl.y - radius);
        const mask = new Graphics().circle(isl.x, isl.y, radius).fill(0xffffff);
        c.addChild(sprite, mask);
        sprite.mask = mask;
      };
      disc(isl.radius, t.sand);
      c.addChild(
        new Graphics().circle(isl.x, isl.y, isl.radius).stroke({ width: 3, color: 0xb98f4e, alpha: 0.55 }),
      );
      disc(isl.radius * 0.74, t.grass);
      c.addChild(
        new Graphics()
          .circle(isl.x, isl.y, isl.radius * 0.74)
          .stroke({ width: 3, color: 0x3f7a2b, alpha: 0.5 }),
      );

      const place = (texture: Texture, angle: number, dist: number, scale: number): void => {
        const sp = new Sprite(texture);
        sp.anchor.set(0.5);
        sp.scale.set(t.tileScale * scale);
        sp.position.set(
          isl.x + Math.cos(angle) * isl.radius * dist,
          isl.y + Math.sin(angle) * isl.radius * dist,
        );
        sp.rotation = angle * 0.5;
        c.addChild(sp);
      };
      for (let j = 0; j < 3; j++)
        place(t.palms[(i + j) % t.palms.length]!, i * 1.3 + j * 2.2, j === 0 ? 0.0 : 0.38, 0.95 - j * 0.12);
      for (let j = 0; j < 3; j++)
        place(t.rocks[(i + j) % t.rocks.length]!, i * 0.9 + 0.6 + j * 2.1, 0.87, 0.7);
      root.addChild(c);
    });

    root.addChild(new Graphics().rect(0, 0, aw, ah).stroke({ width: 4, color: 0x083a57, alpha: 0.9 }));
    return root;
  }

  private get tex(): TextureSet {
    if (!this.textures) throw new Error('Renderer not initialised.');
    return this.textures;
  }

  private createShipView(s: Ship): ShipView {
    const t = this.tex;
    const node = new Container();
    const sprite = new Sprite(t.ships[s.kind][0]);
    sprite.anchor.set(0.5);
    sprite.scale.set((s.radius * SHIP_LENGTH_PER_RADIUS) / sprite.texture.height);

    const fire = new Sprite(t.fire[0]);
    fire.anchor.set(0.5, 0.85);
    fire.position.set(0, s.radius * 0.5);
    fire.visible = false;

    const bar = new Container();
    const unit = BAR_WIDTH / BAR_LOGICAL_WIDTH;
    const scale = BAR_WIDTH / t.barFrame.width;
    const frame = new Sprite(t.barFrame);
    const fill = new Sprite(t.barGreen);
    for (const sp of [frame, fill]) {
      sp.anchor.set(0.5);
      sp.scale.set(scale);
    }
    const mask = new Graphics();
    mask.position.set((BAR_FILL.x - BAR_LOGICAL_WIDTH / 2) * unit, (BAR_FILL.y - 20) * unit);
    fill.mask = mask;
    bar.addChild(frame, fill, mask);
    bar.position.set(0, -(s.radius * SHIP_LENGTH_PER_RADIUS * 0.5 + 12));

    node.addChild(sprite, fire, bar);
    this.shipLayer.addChild(node);
    return { node, sprite, fire, fill, mask, ratio: -1, level: 0, flashMs: 0, seen: 0 };
  }

  private syncShip(s: Ship): ShipView {
    let v = this.ships.get(s.id);
    if (!v) {
      v = this.createShipView(s);
      this.ships.set(s.id, v);
    }
    v.seen = this.frame;
    v.node.position.set(s.x, s.y);
    v.sprite.rotation = s.angle + Math.PI / 2;

    const ratio = Math.max(0, s.health / s.maxHealth);
    const level = damageLevel(ratio);
    if (level !== v.level) {
      v.level = level;
      v.sprite.texture = this.tex.ships[s.kind][level];
      v.fire.visible = level >= 2;
    }
    if (v.fire.visible) {
      const flicker = Math.sin(this.simTime * 0.03);
      v.fire.texture = this.tex.fire[Math.floor(this.simTime / 120) % 2 === 0 ? 0 : 1]!;
      v.fire.scale.set(0.8 + 0.12 * flicker);
    }
    if (ratio !== v.ratio) {
      v.ratio = ratio;
      const unit = BAR_WIDTH / BAR_LOGICAL_WIDTH;
      v.fill.texture = ratio > 0.5 ? this.tex.barGreen : this.tex.barRed;
      v.mask
        .clear()
        .rect(0, 0, BAR_FILL.w * unit * ratio, BAR_FILL.h * unit)
        .fill(0xffffff);
    }
    return v;
  }

  private sweepShips(): void {
    for (const [id, v] of this.ships) {
      if (v.seen !== this.frame) {
        v.node.destroy({ children: true });
        this.ships.delete(id);
      }
    }
  }

  private syncProjectiles(list: Projectile[]): void {
    for (const p of list) {
      let sp = this.projectiles.get(p.id);
      if (!sp) {
        sp = this.projPool.pop() ?? this.newProjectileSprite();
        sp.tint = p.owner === 'player' ? 0xffffff : 0xff9a8a;
        sp.visible = true;
        this.projectiles.set(p.id, sp);
      }
      sp.position.set(p.x, p.y);
      (sp as Sprite & { seen?: number }).seen = this.frame;
    }
    for (const [id, sp] of this.projectiles) {
      if ((sp as Sprite & { seen?: number }).seen !== this.frame) {
        sp.visible = false;
        this.projPool.push(sp);
        this.projectiles.delete(id);
      }
    }
  }

  private newProjectileSprite(): Sprite {
    const sp = new Sprite(this.tex.ball);
    sp.anchor.set(0.5);
    sp.scale.set(0.9);
    this.projLayer.addChild(sp);
    return sp;
  }

  private handleEvent(ev: SimEvent, state: SimState): void {
    switch (ev.type) {
      case 'shot':
        this.addSpriteEffect(this.tex.explosions[2], ev.x, ev.y, 110, 0.3, 0.75, 0xffe9a0);
        break;
      case 'hit':
        if (ev.target === 'island') this.addEffect(ev.x, ev.y, 0xe9d9a8, 6, 200, 0.8, 2.4);
        else this.addSpriteEffect(this.tex.explosions[2], ev.x, ev.y, 240, 0.35, 0.9);
        if (ev.target === 'enemy') this.flashNearest(ev.x, ev.y);
        break;
      case 'explosion': {
        const big = ev.kind === 'shooter' ? 1.25 : 1;
        this.addEffect(ev.x, ev.y, 0xffb347, 16 * big, 420, 0.5, 2.4);
        this.addSpriteEffect(this.tex.explosions[0], ev.x, ev.y, 560, 0.45 * big, 1.25 * big);
        this.addSpriteEffect(this.tex.explosions[1], ev.x + 8, ev.y - 6, 420, 0.3 * big, 1.0 * big);
        break;
      }
      case 'kill':
        this.addPopup(`+${this.cfg.scorePerKill}`, ev.x, ev.y);
        break;
      case 'playerDamaged': {
        if (!this.reducedMotion) this.shakeMs = SHAKE_MS;
        const pv = this.ships.get(state.player.id);
        if (pv) pv.flashMs = 140;
        break;
      }
      case 'ended':
        if (ev.reason === 'death') {
          this.addEffect(state.player.x, state.player.y, 0xffb347, 28, 700, 0.5, 3.2);
          this.addSpriteEffect(this.tex.explosions[0], state.player.x, state.player.y, 800, 0.8, 2.0);
          this.addSpriteEffect(
            this.tex.explosions[1],
            state.player.x + 10,
            state.player.y - 8,
            600,
            0.6,
            1.6,
          );
        }
        break;
      default:
        break;
    }
  }

  private flashNearest(x: number, y: number): void {
    for (const v of this.ships.values()) {
      if (Math.hypot(v.node.x - x, v.node.y - y) < 40) v.flashMs = 90;
    }
  }

  private addEffect(
    x: number,
    y: number,
    color: number,
    radius: number,
    life: number,
    from: number,
    to: number,
  ): void {
    if (this.effects.length >= MAX_EFFECTS) return;
    const g = new Graphics().circle(0, 0, radius).fill(color);
    g.position.set(x, y);
    g.scale.set(from);
    this.fxLayer.addChild(g);
    this.effects.push({ g, age: 0, life, from, to, startY: y, rise: 0 });
  }

  private addSpriteEffect(
    texture: Texture,
    x: number,
    y: number,
    life: number,
    from: number,
    to: number,
    tint = 0xffffff,
  ): void {
    if (this.effects.length >= MAX_EFFECTS) return;
    const sp = new Sprite(texture);
    sp.anchor.set(0.5);
    sp.tint = tint;
    sp.rotation = x * 0.37;
    sp.position.set(x, y);
    sp.scale.set(from);
    this.fxLayer.addChild(sp);
    this.effects.push({ g: sp, age: 0, life, from, to, startY: y, rise: 0 });
  }

  private addPopup(text: string, x: number, y: number): void {
    if (this.effects.length >= MAX_EFFECTS) return;
    const label = new Text({ text, style: POPUP_STYLE });
    label.anchor.set(0.5);
    label.position.set(x, y - 18);
    this.fxLayer.addChild(label);
    this.effects.push({
      g: label,
      age: 0,
      life: 900,
      from: 1,
      to: 1.15,
      startY: y - 18,
      rise: this.reducedMotion ? 0 : 46,
    });
  }

  private updateEffects(ms: number): void {
    const alive: Effect[] = [];
    for (const e of this.effects) {
      e.age += ms;
      const t = e.age / e.life;
      if (t >= 1) {
        e.g.destroy();
        continue;
      }
      e.g.scale.set(e.from + (e.to - e.from) * t);
      e.g.y = e.startY - e.rise * t;
      e.g.alpha = 1 - t;
      alive.push(e);
    }
    this.effects = alive;
  }

  private updateShake(ms: number): void {
    if (this.shakeMs > 0) {
      this.shakeMs = Math.max(0, this.shakeMs - ms);
      const amp = (6 * this.shakeMs) / SHAKE_MS;
      this.world.position.set(
        this.baseX + Math.sin(this.shakeMs * 0.9) * amp,
        this.baseY + Math.cos(this.shakeMs * 1.3) * amp,
      );
    } else {
      this.world.position.set(this.baseX, this.baseY);
    }
  }
}
