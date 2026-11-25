import { urlParam } from '../utils/urlParams';
import { isScenarioId } from './scenarios';
import { setScenarioId } from './state';

/** Mocks are on by default (also in the published build). Set VITE_ENABLE_MOCKS=false to disable them. */
export const MOCKS_ENABLED = import.meta.env.VITE_ENABLE_MOCKS !== 'false';

export async function enableMocking(): Promise<void> {
  if (!MOCKS_ENABLED) return;

  const scenario = urlParam('scenario');
  if (scenario && isScenarioId(scenario)) setScenarioId(scenario);

  try {
    const { worker } = await import('./browser');
    await worker.start({
      onUnhandledFrame: 'bypass',
      quiet: true,
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    });
  } catch (err) {
    console.warn('[mocks] could not start the mock service worker', err);
  }
}
