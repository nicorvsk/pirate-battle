import type { EndReason } from '../game/sim/types';

export const reasonLabel = (reason: EndReason): string => (reason === 'death' ? 'Ship sunk' : "Time's up");

export const formatSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export const formatClock = (totalSeconds: number): string =>
  `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('en-US');
}
