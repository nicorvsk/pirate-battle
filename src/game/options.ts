import { LIMITS } from './config';

export interface Options {
  durationSec: number;
  spawnIntervalSec: number;
}

export const DEFAULT_OPTIONS: Options = { durationSec: 90, spawnIntervalSec: 2.5 };

export interface OptionsDraft {
  durationSec: string;
  spawnIntervalSec: string;
}

export interface OptionsErrors {
  durationSec?: string;
  spawnIntervalSec?: string;
}

const { durationSec: DUR, spawnIntervalSec: SPAWN } = LIMITS;

export function isValidOptions(o: unknown): o is Options {
  if (typeof o !== 'object' || o === null) return false;
  const { durationSec, spawnIntervalSec } = o as Record<string, unknown>;
  return (
    typeof durationSec === 'number' &&
    Number.isInteger(durationSec) &&
    durationSec >= DUR.min &&
    durationSec <= DUR.max &&
    typeof spawnIntervalSec === 'number' &&
    Number.isFinite(spawnIntervalSec) &&
    spawnIntervalSec >= SPAWN.min &&
    spawnIntervalSec <= SPAWN.max
  );
}

const parse = (s: string): number => (s.trim() === '' ? NaN : Number(s.trim().replace(',', '.')));

export function validateDraft(draft: OptionsDraft): { options: Options | null; errors: OptionsErrors } {
  const errors: OptionsErrors = {};
  const durationSec = parse(draft.durationSec);
  const spawnIntervalSec = parse(draft.spawnIntervalSec);

  if (!Number.isInteger(durationSec) || durationSec < DUR.min || durationSec > DUR.max) {
    errors.durationSec = `Enter a whole number of seconds between ${DUR.min} and ${DUR.max}.`;
  }
  if (!Number.isFinite(spawnIntervalSec) || spawnIntervalSec < SPAWN.min || spawnIntervalSec > SPAWN.max) {
    errors.spawnIntervalSec = `Enter a number of seconds between ${SPAWN.min} and ${SPAWN.max}.`;
  }
  if (errors.durationSec || errors.spawnIntervalSec) return { options: null, errors };
  return { options: { durationSec, spawnIntervalSec }, errors };
}
