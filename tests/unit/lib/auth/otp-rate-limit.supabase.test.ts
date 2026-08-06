import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OTP_RATE_LIMIT_MAX_WINDOW_MS,
  SupabaseOtpRateLimitStore,
} from '@/lib/auth/otp-rate-limit.supabase';
import { FakeDatabase } from '../../../helpers/fake-supabase';

const KEY = 'email:2f0a9c'; // already a salted digest by the time it gets here
const AT = Date.parse('2026-08-05T10:00:00.000Z');

describe('SupabaseOtpRateLimitStore', () => {
  it('records a hit as its bucket, its time and the time it stops counting', async () => {
    const db = new FakeDatabase();
    await new SupabaseOtpRateLimitStore(db.client()).record(KEY, AT);

    expect(db.rows('otp_rate_limit_hits')).toEqual([
      {
        bucket: KEY,
        hit_at: '2026-08-05T10:00:00.000Z',
        expires_at: new Date(AT + OTP_RATE_LIMIT_MAX_WINDOW_MS).toISOString(),
      },
    ]);
  });

  it('stores the digest it was handed and nothing that could be an address', async () => {
    const db = new FakeDatabase();
    await new SupabaseOtpRateLimitStore(db.client()).record(KEY, AT);

    const written = JSON.stringify(db.rows('otp_rate_limit_hits'));
    expect(written).not.toContain('@');
    expect(Object.keys(db.rows('otp_rate_limit_hits')[0]!).sort()).toEqual([
      'bucket',
      'expires_at',
      'hit_at',
    ]);
  });

  it('counts only this bucket, and only inside the window', async () => {
    const db = new FakeDatabase();
    const store = new SupabaseOtpRateLimitStore(db.client());
    await store.record(KEY, AT - 60_000);
    await store.record(KEY, AT);
    await store.record('email:other', AT);

    expect(await store.countSince(KEY, AT - 120_000)).toBe(2);
    // The window is what drains the count: an older hit simply is not counted.
    expect(await store.countSince(KEY, AT - 30_000)).toBe(1);
    expect(await store.countSince(KEY, AT + 1)).toBe(0);
  });

  it('sweeps hits no window can still count, and leaves the rest', async () => {
    const db = new FakeDatabase();
    const store = new SupabaseOtpRateLimitStore(db.client());
    await store.record(KEY, AT - OTP_RATE_LIMIT_MAX_WINDOW_MS - 1_000);
    await store.record(KEY, AT);

    const swept = await store.sweepExpired(new Date(AT));

    expect(swept).toBe(1);
    expect(db.rows('otp_rate_limit_hits')).toHaveLength(1);
  });

  it('surfaces a store failure, so the limiter can fail closed on it', async () => {
    const db = new FakeDatabase();
    db.failWith = 'permission denied';
    const store = new SupabaseOtpRateLimitStore(db.client());

    await expect(store.countSince(KEY, AT)).rejects.toThrow(/permission denied/);
    await expect(store.record(KEY, AT)).rejects.toThrow(/permission denied/);
  });

  /**
   * THE FAILURE THAT DOES NOT LOOK LIKE ONE. A HEAD request against a table
   * PostgREST cannot see comes back status 204 with `error: null` and no count,
   * which supabase-js hands over as `{ count: null, error: null }` — measured
   * against the real project before migration 0003 was applied. Reading that as
   * zero would answer "first attempt" for every request while the counters were
   * unreachable, which is the one direction this control must never fail in.
   */
  it('refuses to read an UNKNOWN count as zero attempts', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ gte: async () => ({ count: null, error: null }) }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(new SupabaseOtpRateLimitStore(client).countSince(KEY, AT)).rejects.toThrow(
      /count/i,
    );
  });
});
