import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { registry, statusFor } from '../api/registry';
import { useRegistry } from '../api/useRegistry';
import { buildConfig, type GameConfig } from '../game/config';
import { applyConfigOverrides } from '../game/e2eConfig';
import type { Options } from '../game/options';
import { MainMenu } from '../screens/MainMenu';
import { OptionsScreen } from '../screens/OptionsScreen';
import { ResultScreen } from '../screens/ResultScreen';
import {
  getPlayerId,
  loadLastResult,
  loadOptions,
  newMatchId,
  saveLastResult,
  saveOptions,
  type MatchResult,
  type MatchSummary,
} from '../storage/persistence';
import { LoadErrorBoundary } from '../widgets/LoadErrorBoundary';
import { LoadingOverlay } from '../widgets/LoadingOverlay';
import { MatchScreen, preloadMatchScreen } from './lazyScreens';

type Screen =
  | { name: 'menu' }
  | { name: 'options' }
  | { name: 'playing'; matchKey: number; config: GameConfig }
  | { name: 'result'; result: MatchResult };

export default function App() {
  const [options, setOptions] = useState<Options>(loadOptions);
  const [lastResult, setLastResult] = useState<MatchResult | null>(loadLastResult);
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const reg = useRegistry();
  const matchCounter = useRef(0);
  const matchOptions = useRef<Options>(options);

  // Pending records survive failures and refreshes: retry on startup and when the network returns.
  useEffect(() => {
    void registry.submitAll();
    preloadMatchScreen();
    const onOnline = (): void => void registry.submitAll();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const play = useCallback(() => {
    matchOptions.current = options;
    matchCounter.current += 1;
    const config = applyConfigOverrides(buildConfig(options));
    setScreen({ name: 'playing', matchKey: matchCounter.current, config });
  }, [options]);

  const finish = useCallback((summary: MatchSummary) => {
    const result: MatchResult = {
      ...summary,
      matchId: newMatchId(),
      playerId: getPlayerId(),
      finishedAt: new Date().toISOString(),
      options: matchOptions.current,
    };
    saveLastResult(result);
    setLastResult(result);
    registry.enqueue(result);
    void registry.submit(result.matchId);
    setScreen({ name: 'result', result });
  }, []);

  const toMenu = useCallback(() => setScreen({ name: 'menu' }), []);

  switch (screen.name) {
    case 'options':
      return (
        <OptionsScreen
          options={options}
          onSave={(next) => {
            setOptions(next);
            return saveOptions(next);
          }}
          onBack={toMenu}
        />
      );
    case 'playing':
      return (
        <LoadErrorBoundary onQuit={toMenu}>
          <Suspense fallback={<LoadingOverlay label="Loading game" />}>
            <MatchScreen key={screen.matchKey} config={screen.config} onFinish={finish} onQuit={toMenu} />
          </Suspense>
        </LoadErrorBoundary>
      );
    case 'result':
      return (
        <ResultScreen
          result={screen.result}
          status={statusFor(reg, screen.result.matchId)}
          onRetry={() => void registry.submit(screen.result.matchId)}
          onPlayAgain={play}
          onMenu={toMenu}
        />
      );
    default:
      return (
        <MainMenu
          lastResult={lastResult}
          options={options}
          onPlay={play}
          onOptions={() => setScreen({ name: 'options' })}
        />
      );
  }
}
