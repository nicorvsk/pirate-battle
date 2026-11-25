import { urlParam } from '../utils/urlParams';
import type { GameConfig } from './config';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function merge(base: unknown, patch: unknown): unknown {
  if (!isObject(base) || !isObject(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__') continue;
    out[key] = key in base ? merge(base[key], value) : value;
  }
  return out;
}

/** Test instrumentation: with `?e2e&cfg=<json>` the JSON is deep-merged into the match configuration. */
export function applyConfigOverrides(cfg: GameConfig): GameConfig {
  if (urlParam('e2e') === null) return cfg;
  const raw = urlParam('cfg');
  if (!raw) return cfg;
  try {
    return merge(cfg, JSON.parse(raw)) as GameConfig;
  } catch {
    console.warn('[e2e] ignoring invalid cfg parameter');
    return cfg;
  }
}
