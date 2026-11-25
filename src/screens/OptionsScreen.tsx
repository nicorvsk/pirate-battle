import { useState, type FormEvent } from 'react';
import { LIMITS } from '../game/config';
import {
  DEFAULT_OPTIONS,
  validateDraft,
  type Options,
  type OptionsDraft,
  type OptionsErrors,
} from '../game/options';

interface Props {
  options: Options;
  /** Returns false when the browser refused to persist the value. */
  onSave: (options: Options) => boolean;
  onBack: () => void;
}

const toDraft = (o: Options): OptionsDraft => ({
  durationSec: String(o.durationSec),
  spawnIntervalSec: String(o.spawnIntervalSec),
});

export function OptionsScreen({ options, onSave, onBack }: Props) {
  const [draft, setDraft] = useState<OptionsDraft>(() => toDraft(options));
  const [errors, setErrors] = useState<OptionsErrors>({});
  const [saved, setSaved] = useState<'idle' | 'saved' | 'failed'>('idle');

  const change = (key: keyof OptionsDraft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved('idle');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = validateDraft(draft);
    setErrors(result.errors);
    if (!result.options) {
      setSaved('idle');
      document.getElementById(result.errors.durationSec ? 'opt-duration' : 'opt-spawn')?.focus();
      return;
    }
    setSaved(onSave(result.options) ? 'saved' : 'failed');
  };

  const reset = () => {
    setDraft(toDraft(DEFAULT_OPTIONS));
    setErrors({});
    setSaved('idle');
  };

  return (
    <main className="screen">
      <div className="panel">
        <h1>Options</h1>
        <form className="form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="opt-duration">Game session time (seconds)</label>
            <input
              id="opt-duration"
              type="text"
              inputMode="numeric"
              value={draft.durationSec}
              onChange={(e) => change('durationSec', e.target.value)}
              aria-invalid={errors.durationSec ? true : undefined}
              aria-describedby={`opt-duration-hint${errors.durationSec ? ' opt-duration-error' : ''}`}
            />
            <p id="opt-duration-hint" className="hint">
              Whole seconds, {LIMITS.durationSec.min} to {LIMITS.durationSec.max}.
            </p>
            {errors.durationSec && (
              <p id="opt-duration-error" className="error" role="alert">
                {errors.durationSec}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="opt-spawn">Enemy spawn time (seconds)</label>
            <input
              id="opt-spawn"
              type="text"
              inputMode="decimal"
              value={draft.spawnIntervalSec}
              onChange={(e) => change('spawnIntervalSec', e.target.value)}
              aria-invalid={errors.spawnIntervalSec ? true : undefined}
              aria-describedby={`opt-spawn-hint${errors.spawnIntervalSec ? ' opt-spawn-error' : ''}`}
            />
            <p id="opt-spawn-hint" className="hint">
              Time between enemy spawns, {LIMITS.spawnIntervalSec.min} to {LIMITS.spawnIntervalSec.max}. Must
              be positive.
            </p>
            {errors.spawnIntervalSec && (
              <p id="opt-spawn-error" className="error" role="alert">
                {errors.spawnIntervalSec}
              </p>
            )}
          </div>

          <p role="status" className={saved === 'failed' ? 'error' : 'ok'}>
            {saved === 'saved' && 'Options saved. They apply to the next match.'}
            {saved === 'failed' &&
              'Could not save options in this browser. They apply only until you reload.'}
          </p>

          <div className="row">
            <button type="submit">Save</button>
            <button type="button" onClick={reset}>
              Reset to defaults
            </button>
            <button type="button" onClick={onBack}>
              Back
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
