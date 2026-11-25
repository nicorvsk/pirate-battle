import { clamp, normalizeAngle } from '../../utils/math';
import { createRng, type Rng } from '../../utils/rng';
import type { GameConfig, WeaponConfig } from '../config';
import {
  NEUTRAL_INPUT,
  type PlayerInput,
  type Ship,
  type ShipKind,
  type SimEvent,
  type SimState,
  type Owner,
} from './types';

export const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 100;
const SPAWN_MARGIN = 40;

export class Simulation {
  readonly cfg: GameConfig;
  readonly state: SimState;
  input: PlayerInput = { ...NEUTRAL_INPUT };
  paused = false;

  private rng: Rng;
  private acc = 0;
  private nextId = 1;
  private spawnTimerMs: number;
  private events: SimEvent[] = [];

  constructor(cfg: GameConfig, seed: number) {
    this.cfg = cfg;
    this.rng = createRng(seed);
    this.spawnTimerMs = Math.min(1000, cfg.spawn.intervalSec * 1000);
    this.state = {
      status: 'running',
      endReason: null,
      elapsedMs: 0,
      score: 0,
      player: this.makeShip('player', 160, cfg.arena.height / 2, 0),
      enemies: [],
      projectiles: [],
    };
  }

  advance(frameMs: number): void {
    if (this.paused || this.state.status === 'ended') return;
    this.acc += Math.min(frameMs, MAX_FRAME_MS);
    while (this.acc >= STEP_MS && this.state.status === 'running') {
      this.acc -= STEP_MS;
      this.step(STEP_MS);
    }
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (!p) {
      this.acc = 0;
      this.input = { ...NEUTRAL_INPUT };
    }
  }

  private step(stepMs: number): void {
    const s = this.state;
    const dt = stepMs / 1000;
    s.elapsedMs += stepMs;

    this.tickCooldowns(s.player, stepMs);
    this.updatePlayer(dt);

    for (const e of s.enemies) {
      this.tickCooldowns(e, stepMs);
      if (e.kind === 'chaser') this.updateChaser(e, dt);
      else this.updateShooter(e, dt);
    }

    for (const p of s.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.lifeMs -= stepMs;
      if (p.lifeMs <= 0) p.alive = false;
    }

    this.resolveShipTerrain(s.player);
    for (const e of s.enemies) this.resolveShipTerrain(e);
    this.resolveProjectiles();
    this.resolveChaserImpacts();
    this.updateSpawns(stepMs);

    s.enemies = s.enemies.filter((e) => e.alive);
    s.projectiles = s.projectiles.filter((p) => p.alive);

    if (s.player.health <= 0) this.end('death');
    else if (s.elapsedMs >= this.cfg.session.durationSec * 1000) this.end('time');
  }

  private end(reason: 'time' | 'death'): void {
    const s = this.state;
    if (reason === 'death') s.player.alive = false;
    s.status = 'ended';
    s.endReason = reason;
    s.elapsedMs = Math.min(s.elapsedMs, this.cfg.session.durationSec * 1000);
    this.input = { ...NEUTRAL_INPUT };
    this.events.push({ type: 'ended', reason });
  }

  private makeShip(kind: ShipKind, x: number, y: number, angle: number): Ship {
    const c = kind === 'player' ? this.cfg.player : kind === 'chaser' ? this.cfg.chaser : this.cfg.shooter;
    return {
      id: this.nextId++,
      kind,
      x,
      y,
      angle,
      health: c.maxHealth,
      maxHealth: c.maxHealth,
      radius: c.radius,
      alive: true,
      cdFront: 0,
      cdLeft: 0,
      cdRight: 0,
    };
  }

  private tickCooldowns(ship: Ship, ms: number): void {
    ship.cdFront = Math.max(0, ship.cdFront - ms);
    ship.cdLeft = Math.max(0, ship.cdLeft - ms);
    ship.cdRight = Math.max(0, ship.cdRight - ms);
  }

  private turnToward(ship: Ship, tx: number, ty: number, turnSpeed: number, dt: number): number {
    const diff = normalizeAngle(Math.atan2(ty - ship.y, tx - ship.x) - ship.angle);
    ship.angle = normalizeAngle(ship.angle + clamp(diff, -turnSpeed * dt, turnSpeed * dt));
    return diff;
  }

  private moveForward(ship: Ship, speed: number, dt: number): void {
    ship.x += Math.cos(ship.angle) * speed * dt;
    ship.y += Math.sin(ship.angle) * speed * dt;
  }

  private spawnProjectile(owner: Owner, x: number, y: number, angle: number, w: WeaponConfig): void {
    this.state.projectiles.push({
      id: this.nextId++,
      owner,
      x,
      y,
      vx: Math.cos(angle) * w.projectileSpeed,
      vy: Math.sin(angle) * w.projectileSpeed,
      damage: w.damage,
      radius: w.projectileRadius,
      lifeMs: w.projectileLifetimeMs,
      alive: true,
    });
    this.events.push({ type: 'shot', x, y, angle, owner });
  }

  private updatePlayer(dt: number): void {
    const p = this.state.player;
    const c = this.cfg.player;
    const inp = this.input;

    p.angle = normalizeAngle(p.angle + inp.turn * c.turnSpeed * dt);
    if (inp.forward) this.moveForward(p, c.moveSpeed, dt);

    if (inp.fireFront && p.cdFront <= 0) {
      p.cdFront = c.frontal.cooldownMs;
      this.spawnProjectile(
        'player',
        p.x + Math.cos(p.angle) * (p.radius + 6),
        p.y + Math.sin(p.angle) * (p.radius + 6),
        p.angle,
        c.frontal,
      );
    }
    if (inp.fireLeft && p.cdLeft <= 0) {
      p.cdLeft = c.side.cooldownMs;
      this.fireBroadside(p, -Math.PI / 2);
    }
    if (inp.fireRight && p.cdRight <= 0) {
      p.cdRight = c.side.cooldownMs;
      this.fireBroadside(p, Math.PI / 2);
    }
  }

  private fireBroadside(p: Ship, sideOffset: number): void {
    const { count, spacing } = this.cfg.player.side;
    const dir = p.angle + sideOffset;
    const fx = Math.cos(p.angle);
    const fy = Math.sin(p.angle);
    for (let i = 0; i < count; i++) {
      const along = (i - (count - 1) / 2) * spacing;
      this.spawnProjectile(
        'player',
        p.x + fx * along + Math.cos(dir) * (p.radius + 6),
        p.y + fy * along + Math.sin(dir) * (p.radius + 6),
        dir,
        this.cfg.player.side,
      );
    }
  }

  /**
   * Where an enemy should head to reach (tx, ty). If an island blocks the straight line, this is a
   * waypoint beside the nearest blocking island, so ships go around instead of sliding along the coast.
   */
  private steerTarget(ship: Ship, tx: number, ty: number): { x: number; y: number; blocked: boolean } {
    const dx = tx - ship.x;
    const dy = ty - ship.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1) return { x: tx, y: ty, blocked: false };
    let best: { isl: GameConfig['islands'][number]; t: number } | null = null;
    for (const isl of this.cfg.islands) {
      const t = ((isl.x - ship.x) * dx + (isl.y - ship.y) * dy) / len2;
      if (t <= 0 || t >= 1) continue;
      const cx = ship.x + dx * t;
      const cy = ship.y + dy * t;
      const clearance = isl.radius + ship.radius + 12;
      if (Math.hypot(isl.x - cx, isl.y - cy) < clearance && (!best || t < best.t)) best = { isl, t };
    }
    if (!best) return { x: tx, y: ty, blocked: false };
    const { isl, t } = best;
    let nx = ship.x + dx * t - isl.x;
    let ny = ship.y + dy * t - isl.y;
    let nd = Math.hypot(nx, ny);
    if (nd < 1) {
      nx = -dy;
      ny = dx;
      nd = Math.hypot(nx, ny);
    }
    nx /= nd;
    ny /= nd;
    const r = isl.radius + ship.radius + 28;
    const { width, height } = this.cfg.arena;
    return {
      x: clamp(isl.x + nx * r, ship.radius, width - ship.radius),
      y: clamp(isl.y + ny * r, ship.radius, height - ship.radius),
      blocked: true,
    };
  }

  private updateChaser(e: Ship, dt: number): void {
    const c = this.cfg.chaser;
    const pl = this.state.player;
    const goal = this.steerTarget(e, pl.x, pl.y);
    this.turnToward(e, goal.x, goal.y, c.turnSpeed, dt);
    this.moveForward(e, c.moveSpeed, dt);
  }

  private updateShooter(e: Ship, dt: number): void {
    const c = this.cfg.shooter;
    const pl = this.state.player;
    const goal = this.steerTarget(e, pl.x, pl.y);
    this.turnToward(e, goal.x, goal.y, c.turnSpeed, dt);
    const dist = Math.hypot(pl.x - e.x, pl.y - e.y);

    if (dist > c.stopDistance || goal.blocked) this.moveForward(e, c.moveSpeed, dt);

    const aimed = Math.abs(normalizeAngle(Math.atan2(pl.y - e.y, pl.x - e.x) - e.angle)) < 0.2;
    if (dist <= c.attackRange && aimed && e.cdFront <= 0) {
      e.cdFront = c.weapon.cooldownMs;
      this.spawnProjectile(
        'enemy',
        e.x + Math.cos(e.angle) * (e.radius + 6),
        e.y + Math.sin(e.angle) * (e.radius + 6),
        e.angle,
        c.weapon,
      );
    }
  }

  private resolveShipTerrain(ship: Ship): void {
    const { width, height } = this.cfg.arena;
    ship.x = clamp(ship.x, ship.radius, width - ship.radius);
    ship.y = clamp(ship.y, ship.radius, height - ship.radius);
    for (const isl of this.cfg.islands) {
      const dx = ship.x - isl.x;
      const dy = ship.y - isl.y;
      const min = ship.radius + isl.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        ship.x = isl.x + (dx / d) * min;
        ship.y = isl.y + (dy / d) * min;
      }
    }
    ship.x = clamp(ship.x, ship.radius, width - ship.radius);
    ship.y = clamp(ship.y, ship.radius, height - ship.radius);
  }

  private resolveProjectiles(): void {
    const s = this.state;
    const { width, height } = this.cfg.arena;
    for (const p of s.projectiles) {
      if (!p.alive) continue;
      if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) {
        p.alive = false;
        continue;
      }
      if (this.cfg.islands.some((i) => Math.hypot(p.x - i.x, p.y - i.y) <= i.radius + p.radius)) {
        p.alive = false;
        this.events.push({ type: 'hit', x: p.x, y: p.y, target: 'island' });
        continue;
      }
      if (p.owner === 'player') {
        for (const e of s.enemies) {
          if (!e.alive) continue;
          if (Math.hypot(p.x - e.x, p.y - e.y) <= e.radius + p.radius) {
            p.alive = false;
            e.health -= p.damage;
            this.events.push({ type: 'hit', x: p.x, y: p.y, target: 'enemy' });
            if (e.health <= 0) {
              e.alive = false;
              s.score += this.cfg.scorePerKill;
              this.events.push({ type: 'explosion', x: e.x, y: e.y, kind: e.kind });
              this.events.push({ type: 'kill', id: e.id, kind: e.kind, x: e.x, y: e.y });
            }
            break;
          }
        }
      } else {
        const pl = s.player;
        if (Math.hypot(p.x - pl.x, p.y - pl.y) <= pl.radius + p.radius) {
          p.alive = false;
          this.damagePlayer(p.damage, p.x, p.y);
        }
      }
    }
  }

  private resolveChaserImpacts(): void {
    const pl = this.state.player;
    for (const e of this.state.enemies) {
      if (!e.alive || e.kind !== 'chaser') continue;
      if (Math.hypot(e.x - pl.x, e.y - pl.y) <= e.radius + pl.radius) {
        e.alive = false;
        this.events.push({ type: 'explosion', x: e.x, y: e.y, kind: 'chaser' });
        this.damagePlayer(this.cfg.chaser.collisionDamage, e.x, e.y);
      }
    }
  }

  private damagePlayer(amount: number, x: number, y: number): void {
    const pl = this.state.player;
    pl.health = Math.max(0, pl.health - amount);
    this.events.push({ type: 'hit', x, y, target: 'player' });
    this.events.push({ type: 'playerDamaged', amount });
  }

  private updateSpawns(stepMs: number): void {
    this.spawnTimerMs -= stepMs;
    if (this.spawnTimerMs > 0) return;
    const pos = this.findSpawnPoint();
    if (!pos) return;
    this.spawnTimerMs += this.cfg.spawn.intervalSec * 1000;
    const { chaserWeight, shooterWeight } = this.cfg.spawn;
    const kind: ShipKind = this.rng() * (chaserWeight + shooterWeight) < chaserWeight ? 'chaser' : 'shooter';
    const pl = this.state.player;
    const angle = Math.atan2(pl.y - pos.y, pl.x - pos.x);
    this.state.enemies.push(this.makeShip(kind, pos.x, pos.y, angle));
  }

  private findSpawnPoint(): { x: number; y: number } | null {
    const { width, height } = this.cfg.arena;
    const { maxAttempts, minDistanceFromPlayer } = this.cfg.spawn;
    const pl = this.state.player;
    for (let i = 0; i < maxAttempts; i++) {
      const x = SPAWN_MARGIN + this.rng() * (width - SPAWN_MARGIN * 2);
      const y = SPAWN_MARGIN + this.rng() * (height - SPAWN_MARGIN * 2);
      if (Math.hypot(x - pl.x, y - pl.y) < minDistanceFromPlayer) continue;
      if (this.cfg.islands.some((isl) => Math.hypot(x - isl.x, y - isl.y) < isl.radius + 40)) continue;
      if (this.state.enemies.some((e) => Math.hypot(x - e.x, y - e.y) < 50)) continue;
      return { x, y };
    }
    return null;
  }
}
