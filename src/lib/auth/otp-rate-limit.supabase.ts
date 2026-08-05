/**
 * Supabase-backed OTP rate-limit counters.
 *
 * ── WHAT A ROW IS, AND WHAT IT IS NOT ──
 *
 * One row is one send attempt: an opaque bucket digest, when it happened, and
 * when it stops being able to count. It holds NO address and NO source address —
 * the key arrives already salted and digested (`otp-rate-limit.ts`), and this
 * adapter never sees the value behind it. A dump of this table is a list of
 * opaque strings and timestamps: it can say how many attempts a bucket made,
 * never whose.
 *
 * ── EXPIRY IS ENFORCED BY THE QUERY PREDICATE, AND ONLY SWEPT FOR SIZE ──
 *
 * `countSince` counts `hit_at >= since`, so the window drains ON EVERY READ. A
 * hit outside the window is not counted whether or not anything ever deleted it,
 * which is the property that matters: the alternative — trusting a scheduled job
 * to move the boundary — means a job that fails quietly turns a rate limit into a
 * permanent lockout, and a job that runs early lets a spent window count again.
 * Neither failure is acceptable for a control that decides whether a real user
 * can sign in.
 *
 * `expires_at` and {@link SupabaseOtpRateLimitStore.sweepExpired} exist purely so
 * the table does not grow forever. `expires_at` is `hit_at` plus the LONGEST
 * window any bucket uses, so a swept row is one no bucket could have counted.
 * Correctness never depends on the sweep running.
 *
 * ── ACCESS ──
 *
 * The table has RLS on with zero policies and no grants to `anon` or
 * `authenticated` (`supabase/migrations/0003_durable_stores.sql`), so only
 * server-side code holding the service-role key reaches it. No browser session
 * can read the counters, and none needs to.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { OTP_RATE_LIMIT_MAX_WINDOW_MS, type OtpRateLimitStore } from '@/lib/auth/otp-rate-limit';

export { OTP_RATE_LIMIT_MAX_WINDOW_MS };

/** Row shape of `public.otp_rate_limit_hits`. */
const TABLE = 'otp_rate_limit_hits';

export class SupabaseOtpRateLimitStore implements OtpRateLimitStore {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * How many hits this bucket has inside the window. Throws on a store failure
   * rather than answering zero: the limiter treats a throw as a refusal, and a
   * silent zero would read as "first attempt" for every request while the
   * database was unreachable.
   */
  async countSince(key: string, since: number): Promise<number> {
    const { count, error } = await this.client
      .from(TABLE)
      .select('bucket', { count: 'exact', head: true })
      .eq('bucket', key)
      .gte('hit_at', new Date(since).toISOString());
    if (error) throw new Error(`otp rate limit count failed: ${error.message}`);
    return count ?? 0;
  }

  async record(key: string, at: number): Promise<void> {
    const { error } = await this.client.from(TABLE).insert({
      bucket: key,
      hit_at: new Date(at).toISOString(),
      expires_at: new Date(at + OTP_RATE_LIMIT_MAX_WINDOW_MS).toISOString(),
    });
    if (error) throw new Error(`otp rate limit record failed: ${error.message}`);
  }

  /** Delete hits no window can still count. Hygiene only. Returns how many went. */
  async sweepExpired(now: Date): Promise<number> {
    const { data, error } = await this.client
      .from(TABLE)
      .delete()
      .lte('expires_at', now.toISOString())
      .select('bucket');
    if (error) throw new Error(`otp rate limit sweep failed: ${error.message}`);
    return (data ?? []).length;
  }
}
