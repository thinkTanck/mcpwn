'use client';

import { useSyncExternalStore } from 'react';

/**
 * Tracks `prefers-reduced-motion: reduce` via an external-store subscription
 * (no setState-in-effect). Returns `true` when motion should be suppressed; the
 * SSR snapshot is `true` so the first paint is the calm one. Used to gate
 * sweeps/pulses and — for the replay — to avoid initializing WebGL at all.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return true;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
