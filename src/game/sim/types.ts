export type ShipKind = 'player' | 'chaser' | 'shooter';
export type Owner = 'player' | 'enemy';
export type EndReason = 'time' | 'death';
export type MatchStatus = 'running' | 'ended';

export interface Ship {
  id: number;
  kind: ShipKind;
  x: number;
  y: number;
  angle: number;
  health: number;
  maxHealth: number;
  radius: number;
  alive: boolean;
  cdFront: number;
  cdLeft: number;
  cdRight: number;
}

export interface Projectile {
  id: number;
  owner: Owner;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  lifeMs: number;
  alive: boolean;
}

export interface PlayerInput {
  forward: boolean;
  turn: -1 | 0 | 1;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
}

export const NEUTRAL_INPUT: PlayerInput = {
  forward: false,
  turn: 0,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
};

export type SimEvent =
  | { type: 'shot'; x: number; y: number; angle: number; owner: Owner }
  | { type: 'hit'; x: number; y: number; target: 'player' | 'enemy' | 'island' }
  | { type: 'explosion'; x: number; y: number; kind: ShipKind }
  | { type: 'kill'; id: number; kind: ShipKind; x: number; y: number }
  | { type: 'playerDamaged'; amount: number }
  | { type: 'ended'; reason: EndReason };

export interface SimState {
  status: MatchStatus;
  endReason: EndReason | null;
  elapsedMs: number;
  score: number;
  player: Ship;
  enemies: Ship[];
  projectiles: Projectile[];
}
