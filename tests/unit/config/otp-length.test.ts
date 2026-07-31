import { ConfigError, getEmailOtpLength, EMAIL_OTP_LENGTH_BOUNDS } from '@/config/env';

/**
 * ONE source of truth for how many digits an emailed sign-in code has.
 *
 * This exists because the copy and the reality drifted and nobody noticed: the
 * Supabase project emitted 8 digits while the UI declared "6-digit code" and
 * capped its input at 6, so every real code was silently truncated to a prefix
 * and no one could sign in. Two separate lies, both plausible-looking, neither
 * checkable by reading one file.
 *
 * Supabase allows 6 to 10. The value is env-only (12-factor) so it can track the
 * dashboard without a code change, and everything a human reads is DERIVED from
 * it rather than restated.
 */
describe('getEmailOtpLength (single source of truth)', () => {
  const clean = () => {
    delete process.env.NEXT_PUBLIC_EMAIL_OTP_LENGTH;
  };
  beforeEach(clean);
  afterEach(clean);

  it('exposes the bounds Supabase actually permits', () => {
    expect(EMAIL_OTP_LENGTH_BOUNDS).toEqual({ min: 6, max: 10 });
  });

  it('falls back to a default when unset', () => {
    const n = getEmailOtpLength();
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(EMAIL_OTP_LENGTH_BOUNDS.min);
    expect(n).toBeLessThanOrEqual(EMAIL_OTP_LENGTH_BOUNDS.max);
  });

  it.each([
    ['6', 6],
    ['7', 7],
    ['8', 8],
    ['10', 10],
    ['  8  ', 8],
  ])('reads %s from the environment as %i', (raw, expected) => {
    process.env.NEXT_PUBLIC_EMAIL_OTP_LENGTH = raw as string;
    expect(getEmailOtpLength()).toBe(expected);
  });

  /** A wrong length silently breaks every sign-in, so a bad value must be loud. */
  it.each(['5', '11', '0', '-6', '6.5', 'six', ''])('rejects the invalid value %s', (raw) => {
    process.env.NEXT_PUBLIC_EMAIL_OTP_LENGTH = raw;
    expect(() => getEmailOtpLength()).toThrow(ConfigError);
  });

  it('never leaks the offending value into the error message', () => {
    process.env.NEXT_PUBLIC_EMAIL_OTP_LENGTH = '99';
    try {
      getEmailOtpLength();
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('NEXT_PUBLIC_EMAIL_OTP_LENGTH');
      expect((e as Error).message).not.toContain('99');
    }
  });
});
