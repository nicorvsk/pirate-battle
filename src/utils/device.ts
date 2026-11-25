import { hasUrlParam } from './urlParams';

function matches(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export const isTouchDevice = (): boolean => hasUrlParam('touch') || matches('(pointer: coarse)');

export const prefersReducedMotion = (): boolean => matches('(prefers-reduced-motion: reduce)');
