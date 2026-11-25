import { useSyncExternalStore } from 'react';
import { audio } from '../game/audio/AudioManager';

/** Persisted mute switch. Hidden when the browser has no WebAudio (or under `?e2e`). */
export function SoundToggle() {
  const muted = useSyncExternalStore(audio.subscribe, audio.isMuted);
  if (!audio.enabled) return null;

  return (
    <button
      type="button"
      aria-pressed={!muted}
      onClick={() => {
        audio.unlock();
        audio.setMuted(!muted);
        if (muted) audio.play('click');
      }}
    >
      Sound: {muted ? 'Off' : 'On'}
    </button>
  );
}
