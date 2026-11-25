import { delay, http, HttpResponse } from 'msw';
import { PAGE_SIZE, isMatchRecord, type RegisterResponse } from '../api/contracts';
import { isValidOptions } from '../game/options';
import { commitMatch, findRankPosition, listHistory, listRanking, markSwallowed } from './db';
import type { Op } from './scenarios';
import { getScenario, nextLatencyMs } from './state';

const json = (body: unknown, status = 200): Response =>
  HttpResponse.json(body as Record<string, unknown>, { status });

const intParam = (url: URL, name: string, fallback: number): number => {
  const n = Number(url.searchParams.get(name));
  return Number.isInteger(n) && n >= 1 ? n : fallback;
};

/** Applies the scenario's latency and fault. Returns a response to short-circuit, or null to continue. */
async function preflight(op: Op): Promise<Response | null> {
  const sc = getScenario();
  const ms = nextLatencyMs(sc.latency);
  if (ms > 0) await delay(ms);

  const fault = sc.faults[op];
  if (!fault || fault.kind === 'timeout-after-commit') return null;
  switch (fault.kind) {
    case 'timeout':
      await delay('infinite');
      return null;
    case 'network':
      return HttpResponse.error();
    case 'status':
      return json({ message: fault.message }, fault.status);
  }
  return null;
}

export const handlers = [
  http.get('/api/ranking', async ({ request }) => {
    const early = await preflight('ranking');
    if (early) return early;

    const url = new URL(request.url);
    const options = {
      durationSec: Number(url.searchParams.get('durationSec')),
      spawnIntervalSec: Number(url.searchParams.get('spawnIntervalSec')),
    };
    if (!isValidOptions(options)) return json({ message: 'Invalid configuration.' }, 400);

    const pageSize = Math.min(intParam(url, 'pageSize', PAGE_SIZE), 50);
    return json(listRanking(options, intParam(url, 'page', 1), pageSize, getScenario().fixtures));
  }),

  http.get('/api/players/:playerId/matches', async ({ request, params }) => {
    const early = await preflight('history');
    if (early) return early;

    const url = new URL(request.url);
    const pageSize = Math.min(intParam(url, 'pageSize', PAGE_SIZE), 50);
    return json(listHistory(String(params.playerId), intParam(url, 'page', 1), pageSize));
  }),

  http.get('/api/matches/:matchId/rank', async ({ params }) => {
    const early = await preflight('ranking');
    if (early) return early;

    const position = findRankPosition(String(params.matchId), getScenario().fixtures);
    return position ? json(position) : json({ message: 'Match not found.' }, 404);
  }),

  http.post('/api/matches', async ({ request }) => {
    const early = await preflight('register');
    if (early) return early;

    const body: unknown = await request.json().catch(() => null);
    if (!isMatchRecord(body)) return json({ message: 'Invalid match record.' }, 400);

    const { record, duplicate } = commitMatch(body);
    const fault = getScenario().faults.register;
    if (fault?.kind === 'timeout-after-commit' && markSwallowed(record.matchId)) {
      await delay('infinite');
    }
    const payload: RegisterResponse = { record, duplicate };
    return json(payload, duplicate ? 200 : 201);
  }),
];
