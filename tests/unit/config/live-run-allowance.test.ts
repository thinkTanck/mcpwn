import { ConfigError, getLiveRunAllowance, LIVE_RUN_ALLOWANCE_BOUNDS } from '@/config/env';

/**
 * ONE source of truth for how many free live runs an account gets, TOTAL.
 *
 * ADR-0007 decided a per-account LIFETIME allowance and said the number is a
 * TUNABLE DEFAULT rather than a product promise: env-configured, expected to move
 * with observed judge cost, and never restated as a numeral next to the copy that
 * quotes it. That is the same discipline `getEmailOtpLength` enforces, and for
 * the same reason — the OTP length and its copy drifted apart and shipped.
 *
 * The number is read here and DERIVED everywhere else.
 */
describe('getLiveRunAllowance (single source of truth)', () => {
  const clean = () => {
    delete process.env.LIVE_RUN_ALLOWANCE;
  };
  beforeEach(clean);
  afterEach(clean);

  /**
   * 0 is a legitimate setting, not a misconfiguration: it is the operator's
   * "free live runs are off" switch, and it must be expressible without a code
   * change. The upper bound only exists to catch a fat-fingered paste.
   */
  it('exposes the bounds an allowance may take', () => {
    expect(LIVE_RUN_ALLOWANCE_BOUNDS).toEqual({ min: 0, max: 1000 });
  });

  /** ADR-0007: "The default is ~3 runs per account, total — not per day." */
  it('defaults to 3, the allowance ADR-0007 decided', () => {
    expect(getLiveRunAllowance()).toBe(3);
  });

  it('keeps that default inside its own bounds', () => {
    const n = getLiveRunAllowance();
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(LIVE_RUN_ALLOWANCE_BOUNDS.min);
    expect(n).toBeLessThanOrEqual(LIVE_RUN_ALLOWANCE_BOUNDS.max);
  });

  it.each([
    ['0', 0],
    ['1', 1],
    ['3', 3],
    ['25', 25],
    ['  5  ', 5],
  ])('reads %s from the environment as %i', (raw, expected) => {
    process.env.LIVE_RUN_ALLOWANCE = raw as string;
    expect(getLiveRunAllowance()).toBe(expected);
  });

  it('reads the environment it is handed, not just process.env', () => {
    expect(getLiveRunAllowance({ LIVE_RUN_ALLOWANCE: '7' })).toBe(7);
  });

  /**
   * A bad allowance is a spend control that does not control spend, so it fails
   * loudly at the boundary instead of quietly falling back to a default the
   * operator did not choose.
   */
  it.each(['-1', '1001', '3.5', 'three', '', '   '])('rejects the invalid value %s', (raw) => {
    process.env.LIVE_RUN_ALLOWANCE = raw;
    expect(() => getLiveRunAllowance()).toThrow(ConfigError);
  });

  it('names the variable in the error and never echoes the offending value', () => {
    process.env.LIVE_RUN_ALLOWANCE = '99999';
    try {
      getLiveRunAllowance();
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as Error).message).toContain('LIVE_RUN_ALLOWANCE');
      expect((e as Error).message).not.toContain('99999');
    }
  });
});
