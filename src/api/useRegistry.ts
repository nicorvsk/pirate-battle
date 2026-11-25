import { useSyncExternalStore } from 'react';
import { registry, type RegistrySnapshot } from './registry';

export function useRegistry(): RegistrySnapshot {
  return useSyncExternalStore(registry.subscribe, registry.getSnapshot);
}
