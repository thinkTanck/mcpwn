import { ConfigError, getLiveRunCap } from '@/config/env';

/**
 * The per-account live-run cap is what keeps operator judge cost bounded, so its
 * defaults must hold with NOTHING configured, and a blank env var must never be
 * read as "0" (which would silently disable the gate).
 */

describe('getLiveRunCap', () => {
  it('applies a safe default when nothing is configured', () => {
    expect(getLiveRunCap({})).toEqual({ maxRuns: 20, windowHours: 24 });
  });

  it('reads both knobs from the environment', () => {
    expect(getLiveRunCap({ LIVE_RUN_CAP: '5', LIVE_RUN_WINDOW_HOURS: '6' })).toEqual({
      maxRuns: 5,
      windowHours: 6,
    });
  });

  it('treats a blank value as unset rather than as zero', () => {
    expect(getLiveRunCap({ LIVE_RUN_CAP: '   ' }).maxRuns).toBe(20);
  });

  it.each(['0', '-3', '2.5', 'many'])('rejects the invalid cap %s', (value) => {
    expect(() => getLiveRunCap({ LIVE_RUN_CAP: value })).toThrow(ConfigError);
  });

  it('names the offending variable without echoing its value', () => {
    try {
      getLiveRunCap({ LIVE_RUN_WINDOW_HOURS: 'forever' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('LIVE_RUN_WINDOW_HOURS');
      expect((error as Error).message).not.toContain('forever');
    }
  });
});
