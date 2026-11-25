export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
