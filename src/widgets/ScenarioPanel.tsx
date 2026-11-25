import { useState, type ChangeEvent } from 'react';
import { queryKeys } from '../api/queries';
import { queryClient } from '../api/queryClient';
import { registry } from '../api/registry';
import { findScenario, SCENARIOS } from '../mocks/scenarios';
import { getScenarioId, resetMockState, setScenarioId } from '../mocks/state';

/** Demo tools: pick a network scenario and restore the initial state. */
export function ScenarioPanel() {
  const [id, setId] = useState(getScenarioId);
  const [note, setNote] = useState('');
  const current = findScenario(id);

  const change = (e: ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setScenarioId(next);
    setId(next);
    setNote(`Scenario applied: ${findScenario(next).label}.`);
    void queryClient.invalidateQueries({ queryKey: queryKeys.rankingAll });
    void queryClient.invalidateQueries({ queryKey: queryKeys.historyAll });
  };

  const reset = () => {
    resetMockState();
    registry.reset();
    setId(getScenarioId());
    setNote('Initial state restored: mock data, scenario and pending records were cleared.');
    void queryClient.resetQueries();
  };

  return (
    <details className="card wide">
      <summary>Network scenarios (demo tools)</summary>
      <div className="stack scenario">
        <div className="field">
          <label htmlFor="scenario-select">Scenario</label>
          <select id="scenario-select" value={id} onChange={change}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="hint">{current.description}</p>
        </div>
        <div className="row">
          <button type="button" onClick={reset}>
            Reset to initial state
          </button>
        </div>
        <p role="status" className="ok">
          {note}
        </p>
      </div>
    </details>
  );
}
