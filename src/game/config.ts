export interface WeaponConfig {
  damage: number;
  cooldownMs: number;
  projectileSpeed: number;
  projectileLifetimeMs: number;
  projectileRadius: number;
}

export interface ShipConfig {
  maxHealth: number;
  moveSpeed: number;
  turnSpeed: number;
  radius: number;
}

export interface GameConfig {
  arena: { width: number; height: number };
  session: { durationSec: number };
  spawn: {
    intervalSec: number;
    chaserWeight: number;
    shooterWeight: number;
    minDistanceFromPlayer: number;
    maxAttempts: number;
  };
  player: ShipConfig & {
    frontal: WeaponConfig;
    side: WeaponConfig & { count: number; spacing: number };
  };
  chaser: ShipConfig & { collisionDamage: number };
  shooter: ShipConfig & { attackRange: number; stopDistance: number; weapon: WeaponConfig };
  islands: ReadonlyArray<{ x: number; y: number; radius: number }>;
  scorePerKill: number;
}

export const LIMITS = {
  durationSec: { min: 60, max: 180 },
  spawnIntervalSec: { min: 0.5, max: 10 },
} as const;

export const DEFAULT_CONFIG: GameConfig = {
  arena: { width: 1280, height: 720 },
  session: { durationSec: 90 },
  spawn: {
    intervalSec: 2.5,
    chaserWeight: 0.6,
    shooterWeight: 0.4,
    minDistanceFromPlayer: 300,
    maxAttempts: 20,
  },
  player: {
    maxHealth: 100,
    moveSpeed: 220,
    turnSpeed: 2.6,
    radius: 24,
    frontal: {
      damage: 10,
      cooldownMs: 350,
      projectileSpeed: 520,
      projectileLifetimeMs: 1100,
      projectileRadius: 4,
    },
    side: {
      damage: 6,
      cooldownMs: 1200,
      projectileSpeed: 460,
      projectileLifetimeMs: 900,
      projectileRadius: 4,
      count: 3,
      spacing: 14,
    },
  },
  chaser: { maxHealth: 20, moveSpeed: 150, turnSpeed: 2.2, radius: 20, collisionDamage: 25 },
  shooter: {
    maxHealth: 30,
    moveSpeed: 110,
    turnSpeed: 1.8,
    radius: 22,
    attackRange: 380,
    stopDistance: 260,
    weapon: {
      damage: 8,
      cooldownMs: 1500,
      projectileSpeed: 380,
      projectileLifetimeMs: 1500,
      projectileRadius: 4,
    },
  },
  islands: [
    { x: 400, y: 360, radius: 90 },
    { x: 880, y: 220, radius: 70 },
    { x: 940, y: 540, radius: 100 },
  ],
  scorePerKill: 1,
};

export function buildConfig(opts: { durationSec: number; spawnIntervalSec: number }): GameConfig {
  return structuredClone({
    ...DEFAULT_CONFIG,
    session: { durationSec: opts.durationSec },
    spawn: { ...DEFAULT_CONFIG.spawn, intervalSec: opts.spawnIntervalSec },
  });
}
