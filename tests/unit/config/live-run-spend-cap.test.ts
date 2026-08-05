import { ConfigError, getLiveRunSpendCap, LIVE_RUN_SPEND_CAP_BOUNDS } from '@/config/env';

/**
 * ONE source of truth for the GLOBAL spend cap — the operator's budget backstop.
 *
 * ADR-0007 names two controls and they are not the same control. The per-account
 * lifetime allowance distributes the resource so one user cannot drain the pool;
 * this one bounds the BILL. A cap without an allowance closes the tool for
 * everyone the moment one enthusiast arrives; an allowance without a cap bounds
 * each user and leaves the total unbounded as users arrive.
 *
 * Same discipline as `getLiveRunAllowance`: env-only, documented default, and an
 * out-of-range value is a hard error rather than a silent fallback.
 */
describe('getLiveRunSpendCap (single source of truth)', () => {
  const clean = () => {
    delete process.env.LIVE_RUN_SPEND_CAP;
  };
  beforeEach(clean);
  afterEach(clean);

  /**
   * 0 is the operator's "live runs are off" switch, exactly as it is for the
   * allowance. The upper bound only exists to catch a fat-fingered paste.
   */
  it('exposes the bounds a cap may take', () => {
    expect(LIVE_RUN_SPEND_CAP_BOUNDS).toEqual({ min: 0, max: 100_000 });
  });

  it('defaults to 500 billable live runs per billing period', () => {
    expect(getLiveRunSpendCap()).toBe(500);
  });

  it('keeps that default inside its own bounds', () => {
    const n = getLiveRunSpendCap();
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(LIVE_RUN_SPEND_CAP_BOUNDS.min);
    expect(n).toBeLessThanOrEqual(LIVE_RUN_SPEND_CAP_BOUNDS.max);
  });

  it.each([
    ['0', 0],
    ['1', 1],
    ['500', 500],
    ['12000', 12000],
    ['  40  ', 40],
  ])('reads %s from the environment as %i', (raw, expected) => {
    process.env.LIVE_RUN_SPEND_CAP = raw as string;
    expect(getLiveRunSpendCap()).toBe(expected);
  });

  it('reads the environment it is handed, not just process.env', () => {
    expect(getLiveRunSpendCap({ LIVE_RUN_SPEND_CAP: '9' })).toBe(9);
  });

  /**
   * A cap that silently falls back to a number nobody chose is not a cap. It
   * fails loudly at the boundary instead, matching `getLiveRunAllowance` and
   * `getRunTokenTtlMinutes`.
   */
  it.each(['-1', '100001', '2.5', 'lots', '', '   ', '1e3'])(
    'rejects the invalid value %s',
    (raw) => {
      process.env.LIVE_RUN_SPEND_CAP = raw;
      expect(() => getLiveRunSpendCap()).toThrow(ConfigError);
    },
  );

  it('names the variable in the error and never echoes the offending value', () => {
    process.env.LIVE_RUN_SPEND_CAP = '999999';
    try {
      getLiveRunSpendCap();
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as Error).message).toContain('LIVE_RUN_SPEND_CAP');
      expect((e as Error).message).not.toContain('999999');
    }
  });
});
