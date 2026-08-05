/**
 * The rate limiter, once its counters are SHARED.
 *
 * Phase B recorded the honest limit of the in-memory store: the effective limit
 * was the constant times however many instances were warm, so the number in the
 * code was not the number the internet met. Two things had to change for that to
 * stop being true, and both are pinned here:
 *
 *   1. The counters have to live somewhere every instance can read.
 *   2. The KEY has to be the same on every instance. A per-process salt would
 *      give each instance its own private bucket in the shared table, and the
 *      limit would go on multiplying with a database bill attached.
 */
import {
  InMemoryOtpRateLimitStore,
  OTP_RATE_LIMIT,
  createOtpRateLimiter,
  resolveOtpRateLimiter,
  type OtpRateLimitStore,
} from '@/lib/auth/otp-rate-limit';

const EMAIL = 'user@example.com';
const IP = '203.0.113.7';

/** One shared table, exactly as two instances would see one database. */
function sharedStore(): OtpRateLimitStore & { keys(): string[] } {
  return new InMemoryOtpRateLimitStore();
}

describe('the key salt is injectable, so instances can agree on a bucket', () => {
  it('two limiters with the SAME salt count into one bucket', async () => {
    const store = sharedStore();
    const one = createOtpRateLimiter({ store, salt: 'shared-salt' });
    const two = createOtpRateLimiter({ store, salt: 'shared-salt' });

    await one.check({ email: EMAIL, ip: IP });
    await two.check({ email: EMAIL, ip: IP });

    // One email bucket and one ip bucket, not two of each.
    expect(store.keys()).toHaveLength(2);
  });

  it('two limiters with DIFFERENT salts do not, which is the old defect', async () => {
    const store = sharedStore();
    const one = createOtpRateLimiter({ store, salt: 'instance-a' });
    const two = createOtpRateLimiter({ store, salt: 'instance-b' });

    await one.check({ email: EMAIL, ip: IP });
    await two.check({ email: EMAIL, ip: IP });

    expect(store.keys()).toHaveLength(4);
  });

  it('never writes the address itself, whatever the salt is', async () => {
    const store = sharedStore();
    await createOtpRateLimiter({ store, salt: 'shared-salt' }).check({ email: EMAIL, ip: IP });

    const keys = store.keys().join(' ');
    expect(keys).not.toContain(EMAIL);
    expect(keys).not.toContain('user');
    expect(keys).not.toContain(IP);
  });
});

describe('the limit no longer multiplies per instance', () => {
  it('refuses at the configured total across N instances sharing one store', async () => {
    const store = sharedStore();
    const instances = [1, 2, 3].map(() => createOtpRateLimiter({ store, salt: 'shared-salt' }));

    // Spread the sends round-robin, the way a load balancer would.
    const outcomes: boolean[] = [];
    for (let i = 0; i < OTP_RATE_LIMIT.email.limit + 1; i += 1) {
      const instance = instances[i % instances.length]!;
      outcomes.push((await instance.check({ email: EMAIL, ip: IP })).allowed);
    }

    expect(outcomes.filter(Boolean)).toHaveLength(OTP_RATE_LIMIT.email.limit);
    expect(outcomes[outcomes.length - 1]).toBe(false);
  });

  it('would have allowed limit x instances before, so the assertion is not vacuous', async () => {
    const store = sharedStore();
    const instances = [1, 2, 3].map((n) => createOtpRateLimiter({ store, salt: `instance-${n}` }));

    const outcomes: boolean[] = [];
    for (let i = 0; i < OTP_RATE_LIMIT.email.limit * instances.length; i += 1) {
      const instance = instances[i % instances.length]!;
      outcomes.push((await instance.check({ email: EMAIL, ip: IP })).allowed);
    }

    expect(outcomes.filter(Boolean)).toHaveLength(OTP_RATE_LIMIT.email.limit * instances.length);
  });
});

describe('resolveOtpRateLimiter picks its store the way every other store is picked', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('uses the in-memory store when Supabase is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const limiter = resolveOtpRateLimiter();

    // It works, and it never touched a database to do it.
    expect((await limiter.check({ email: EMAIL, ip: IP })).allowed).toBe(true);
  });

  it('falls back to the in-memory store rather than failing sign-in when the admin credential is unusable', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const limiter = resolveOtpRateLimiter();

    expect((await limiter.check({ email: EMAIL, ip: IP })).allowed).toBe(true);
  });
});
