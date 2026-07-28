import type { DetectorFn } from '@/eval';

/**
 * The LOCKED, operator-provided validated judge for live runs.
 *
 * The detector itself (module 4) exists and is tested; what does not exist yet
 * is the HTTP `JudgeModelPort` adapter that gives it a real model. That is
 * hosted-release Slice 2 and is blocked on the operator's judge key.
 *
 * So this resolver returns `null` and `startLiveRun` refuses with
 * `JUDGE_UNAVAILABLE`. Nothing unvalidated is substituted in the meantime: the
 * measured accuracy claim only holds for the validated judge config, and a run
 * judged by anything else would be a fabricated result. The judge is never
 * user-swappable either way.
 */
export function resolveLiveDetector(): DetectorFn | null {
  return null;
}

/**
 * Whether a live run can currently complete. FALSE until the validated judge is
 * wired, and the UI must say so rather than presenting live runs as working.
 */
export function isLiveRunEnabled(): boolean {
  return resolveLiveDetector() !== null;
}
