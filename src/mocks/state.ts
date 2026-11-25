import { readJson, removeKey, writeJson } from '../storage/localStore';
import { createRng } from '../utils/rng';
import { urlParam } from '../utils/urlParams';
import { resetDb } from './db';
import { DEFAULT_SCENARIO_ID, findScenario, isScenarioId, type Latency, type ScenarioDef } from './scenarios';

const KEY = 'pirate-battle:mock-scenario';

export function getScenarioId(): string {
  const v = readJson(KEY);
  return typeof v === 'string' && isScenarioId(v) ? v : DEFAULT_SCENARIO_ID;
}

export function setScenarioId(id: string): void {
  writeJson(KEY, isScenarioId(id) ? id : DEFAULT_SCENARIO_ID);
}

export const getScenario = (): ScenarioDef => findScenario(getScenarioId());

/** Restores the initial state: mock database and scenario. */
export function resetMockState(): void {
  resetDb();
  removeKey(KEY);
}

/** ?mockLatency=<factor> multiplies every delay (0 = instant). Default 1. */
function latencyScale(): number {
  const raw = urlParam('mockLatency');
  const n = raw === null ? 1 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/** ?mockSeed=<int> seeds the variable-latency generator. Default 1. */
const rng = createRng(Number(urlParam('mockSeed')) || 1);
const OUT_OF_ORDER_MS = [1800, 200, 1000, 100];
const BASE_MS = 120;
let counter = 0;

export function nextLatencyMs(mode: Latency): number {
  const scale = latencyScale();
  let ms: number;
  switch (mode.kind) {
    case 'fixed':
      ms = mode.ms;
      break;
    case 'variable':
      ms = mode.minMs + rng() * (mode.maxMs - mode.minMs);
      break;
    case 'out-of-order':
      ms = OUT_OF_ORDER_MS[counter++ % OUT_OF_ORDER_MS.length];
      break;
    default:
      ms = BASE_MS;
  }
  return Math.round(ms * scale);
}
