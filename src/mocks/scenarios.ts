/** Network scenarios shared by development, tests and the published demo. Pure data. */

export type Op = 'ranking' | 'history' | 'register';

export type Fault =
  | { kind: 'timeout' } // the response never arrives
  | { kind: 'network' } // connection failure
  | { kind: 'status'; status: number; message: string }
  | { kind: 'timeout-after-commit' }; // register only: record is stored, the response never arrives

export type Latency =
  | { kind: 'fast' }
  | { kind: 'fixed'; ms: number }
  | { kind: 'variable'; minMs: number; maxMs: number } // seeded random
  | { kind: 'out-of-order' }; // later requests answer sooner than earlier ones

export type FixtureMode = 'default' | 'none' | 'many';

export interface ScenarioDef {
  id: string;
  label: string;
  description: string;
  fixtures: FixtureMode;
  latency: Latency;
  faults: Partial<Record<Op, Fault>>;
}

const FAST: Latency = { kind: 'fast' };

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: 'success',
    label: 'Success',
    description: 'Everything works. The ranking has 23 fixture players (3 pages).',
    fixtures: 'default',
    latency: FAST,
    faults: {},
  },
  {
    id: 'empty',
    label: 'Empty lists',
    description: 'No fixture players: ranking and history are empty until you play.',
    fixtures: 'none',
    latency: FAST,
    faults: {},
  },
  {
    id: 'many-pages',
    label: 'Many pages',
    description: 'The ranking has 95 fixture players (10 pages).',
    fixtures: 'many',
    latency: FAST,
    faults: {},
  },
  {
    id: 'slow',
    label: 'Slow responses',
    description: 'Every response takes 2.5 s.',
    fixtures: 'default',
    latency: { kind: 'fixed', ms: 2500 },
    faults: {},
  },
  {
    id: 'variable-latency',
    label: 'Variable latency',
    description: 'Seeded random latency between 100 ms and 1.8 s.',
    fixtures: 'default',
    latency: { kind: 'variable', minMs: 100, maxMs: 1800 },
    faults: {},
  },
  {
    id: 'out-of-order',
    label: 'Out-of-order responses',
    description: 'Later requests answer before earlier ones (1.8 s, 0.2 s, 1 s, 0.1 s, repeating).',
    fixtures: 'default',
    latency: { kind: 'out-of-order' },
    faults: {},
  },
  {
    id: 'timeout',
    label: 'Queries time out',
    description: 'Ranking and history never answer (the client times out).',
    fixtures: 'default',
    latency: FAST,
    faults: { ranking: { kind: 'timeout' }, history: { kind: 'timeout' } },
  },
  {
    id: 'network-error',
    label: 'Connection failure',
    description: 'Every request fails to connect.',
    fixtures: 'default',
    latency: FAST,
    faults: { ranking: { kind: 'network' }, history: { kind: 'network' }, register: { kind: 'network' } },
  },
  {
    id: 'http-4xx',
    label: 'HTTP 4xx',
    description: 'Queries answer 400 and registration answers 422 (not retried automatically).',
    fixtures: 'default',
    latency: FAST,
    faults: {
      ranking: { kind: 'status', status: 400, message: 'Bad request.' },
      history: { kind: 'status', status: 400, message: 'Bad request.' },
      register: { kind: 'status', status: 422, message: 'The match could not be processed.' },
    },
  },
  {
    id: 'http-5xx',
    label: 'HTTP 5xx',
    description: 'Every request answers 503.',
    fixtures: 'default',
    latency: FAST,
    faults: {
      ranking: { kind: 'status', status: 503, message: 'Service unavailable.' },
      history: { kind: 'status', status: 503, message: 'Service unavailable.' },
      register: { kind: 'status', status: 503, message: 'Service unavailable.' },
    },
  },
  {
    id: 'ranking-fails',
    label: 'Ranking fails',
    description: 'Only the ranking query answers 500.',
    fixtures: 'default',
    latency: FAST,
    faults: { ranking: { kind: 'status', status: 500, message: 'Ranking is unavailable.' } },
  },
  {
    id: 'history-fails',
    label: 'History fails',
    description: 'Only the history query answers 500.',
    fixtures: 'default',
    latency: FAST,
    faults: { history: { kind: 'status', status: 500, message: 'History is unavailable.' } },
  },
  {
    id: 'timeout-after-register',
    label: 'Timeout after registering',
    description:
      'The first POST of each match is stored but never answers. The retry must return the same record, without duplicating it.',
    fixtures: 'default',
    latency: FAST,
    faults: { register: { kind: 'timeout-after-commit' } },
  },
  {
    id: 'register-unavailable',
    label: 'Registration unavailable',
    description: 'POST answers 503 until you switch to another scenario ("recovery"), then Retry.',
    fixtures: 'default',
    latency: FAST,
    faults: { register: { kind: 'status', status: 503, message: 'Registration is unavailable.' } },
  },
];

export const DEFAULT_SCENARIO_ID = 'success';

export const findScenario = (id: string): ScenarioDef => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];

export const isScenarioId = (id: string): boolean => SCENARIOS.some((s) => s.id === id);
