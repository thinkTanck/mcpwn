import { isLiveRunEnabled, resolveLiveDetector } from '@/live';

/**
 * The LOCKED validated judge. Until its HTTP `JudgeModelPort` adapter lands
 * (hosted-release Slice 2, blocked on the operator key), the resolver must
 * return `null` so live runs are REFUSED rather than judged by something
 * unvalidated. This test is the guard against quietly substituting a stand-in.
 */

describe('resolveLiveDetector', () => {
  it('returns null while the validated judge is not connected', () => {
    expect(resolveLiveDetector()).toBeNull();
  });

  it('reports live runs as not enabled, so the UI cannot claim otherwise', () => {
    expect(isLiveRunEnabled()).toBe(false);
  });
});
