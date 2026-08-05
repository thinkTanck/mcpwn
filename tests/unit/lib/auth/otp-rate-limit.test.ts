import {
  InMemoryOtpRateLimitStore,
  OTP_RATE_LIMIT,
  OtpRateLimitError,
  clientIpFromHeaders,
  createOtpRateLimiter,
  type OtpRateLimitStore,
} from '@/lib/auth/otp-rate-limit';
import { BAD_EMAIL_MESSAGE, RATE_LIMITED_MESSAGE } from '@/lib/auth/errors';

const IP = '203.0.113.7';

/** A clock the test moves by hand, so nothing here sleeps. */
function clock(startIso = '2026-08-05T00:00:00.000Z') {
  let at = new Date(startIso).getTime();
  return {
    now: () => new Date(at),
    advance: (ms: number) => {
      at += ms;
    },
  };
}

function limiterAt(
  time: ReturnType<typeof clock>,
  store: OtpRateLimitStore = new InMemoryOtpRateLimitStore(),
) {
  return createOtpRateLimiter({ store, now: time.now });
}

async function send(
  limiter: ReturnType<typeof createOtpRateLimiter>,
  email = 'user@example.com',
  ip: string | null = IP,
) {
  return limiter.check({ email, ip });
}

describe('the email bucket', () => {
  it('allows requests up to the limit', async () => {
    const time = clock();
    const limiter = limiterAt(time);

    for (let i = 0; i < OTP_RATE_LIMIT.email.limit; i += 1) {
      expect((await send(limiter)).allowed).toBe(true);
    }
  });

  it('refuses the request past the limit', async () => {
    const time = clock();
    const limiter = limiterAt(time);
    for (let i = 0; i < OTP_RATE_LIMIT.email.limit; i += 1) await send(limiter);

    const decision = await send(limiter);

    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.error).toBeInstanceOf(OtpRateLimitError);
  });

  it('counts the same address however it was typed', async () => {
    const time = clock();
    const limiter = limiterAt(time);
    for (let i = 0; i < OTP_RATE_LIMIT.email.limit; i += 1) {
      await send(limiter, '  User@Example.COM ');
    }

    expect((await send(limiter, 'user@example.com')).allowed).toBe(false);
  });

  it('does not count one address against another', async () => {
    const time = clock();
    const limiter = limiterAt(time);
    for (let i = 0; i < OTP_RATE_LIMIT.email.limit; i += 1) await send(limiter, 'a@example.com');

    // A different address from the SAME ip is still under the (larger) ip limit.
    expect((await send(limiter, 'b@example.com')).allowed).toBe(true);
  });

  it('lets the window drain, so a refusal is never permanent', async () => {
    const time = clock();
    const limiter = limiterAt(time);
    for (let i = 0; i < OTP_RATE_LIMIT.email.limit; i += 1) await send(limiter);
    expect((await send(limiter)).allowed).toBe(false);

    time.advance(OTP_RATE_LIMIT.email.windowMs + 1);

    expect((await send(limiter)).allowed).toBe(true);
  });

  it('does not extend the lockout when a refused caller keeps hammering', async () => {
    const time = clock();
    const limiter = limiterAt(time);
    for (let i = 0; i < OTP_RATE_LIMIT.email.limit; i += 1) await send(limiter);

    // Refused attempts are not recorded, so the window drains on schedule.
    for (let i = 0; i < 20; i += 1) {
      time.advance(1_000);
      await send(limiter);
    }
    time.advance(OTP_RATE_LIMIT.email.windowMs);

    expect((await send(limiter)).allowed).toBe(true);
  });
});

describe('the ip bucket', () => {
  it('refuses a flood of distinct addresses from one source', async () => {
    const time = clock();
    const limiter = limiterAt(time);

    let refusedAt = -1;
    for (let i = 0; i < OTP_RATE_LIMIT.ip.limit + 1; i += 1) {
      const decision = await send(limiter, `throwaway-${i}@example.com`);
      if (!decision.allowed && refusedAt === -1) refusedAt = i;
    }

    expect(refusedAt).toBe(OTP_RATE_LIMIT.ip.limit);
  });

  it('is looser than the email bucket, because one address is one user and one ip is many', () => {
    expect(OTP_RATE_LIMIT.ip.limit).toBeGreaterThan(OTP_RATE_LIMIT.email.limit);
  });

  it('does not count one source against another', async () => {
    const time = clock();
    const limiter = limiterAt(time);
    for (let i = 0; i < OTP_RATE_LIMIT.ip.limit; i += 1) {
      await send(limiter, `throwaway-${i}@example.com`, '198.51.100.1');
    }

    expect((await send(limiter, 'fresh@example.com', '198.51.100.2')).allowed).toBe(true);
  });

  it('buckets an unknown source together rather than skipping the check', async () => {
    const time = clock();
    const limiter = limiterAt(time);

    let refusedAt = -1;
    for (let i = 0; i < OTP_RATE_LIMIT.ip.limit + 1; i += 1) {
      const decision = await send(limiter, `throwaway-${i}@example.com`, null);
      if (!decision.allowed && refusedAt === -1) refusedAt = i;
    }

    expect(refusedAt).toBe(OTP_RATE_LIMIT.ip.limit);
  });
});

describe('the refusal tells an attacker nothing', () => {
  it('states the same sentence the provider rate limit already states', async () => {
    const time = clock();
    const limiter = limiterAt(time);
    for (let i = 0; i < OTP_RATE_LIMIT.email.limit; i += 1) await send(limiter);

    const decision = await send(limiter);

    expect(decision.allowed === false && decision.error.message).toBe(RATE_LIMITED_MESSAGE);
  });

  it('states the same sentence whichever bucket tripped', async () => {
    const emailTime = clock();
    const emailLimiter = limiterAt(emailTime);
    for (let i = 0; i < OTP_RATE_LIMIT.email.limit; i += 1) await send(emailLimiter);
    const byEmail = await send(emailLimiter);

    const ipTime = clock();
    const ipLimiter = limiterAt(ipTime);
    for (let i = 0; i < OTP_RATE_LIMIT.ip.limit; i += 1) {
      await send(ipLimiter, `throwaway-${i}@example.com`);
    }
    const byIp = await send(ipLimiter, 'fresh@example.com');

    expect(byEmail.allowed).toBe(false);
    expect(byIp.allowed).toBe(false);
    expect(byEmail.allowed === false && byEmail.error.message).toBe(
      byIp.allowed === false ? byIp.error.message : '',
    );
  });

  it('never names the address, the bucket, the count or the window on the wire', async () => {
    const time = clock();
    const limiter = limiterAt(time);
    for (let i = 0; i < OTP_RATE_LIMIT.email.limit; i += 1) await send(limiter);

    const decision = await send(limiter);
    if (decision.allowed) return expect.unreachable('expected a refusal');
    const wire = decision.error.message;

    expect(wire).not.toContain('user@example.com');
    expect(wire).not.toContain('email');
    expect(wire).not.toContain(IP);
    expect(wire).not.toMatch(/\d+\s*(minutes?|requests?)/i);
  });

  it('keeps a machine-readable scope for our own logs only', async () => {
    const time = clock();
    const limiter = limiterAt(time);
    for (let i = 0; i < OTP_RATE_LIMIT.email.limit; i += 1) await send(limiter);

    const decision = await send(limiter);
    if (decision.allowed) return expect.unreachable('expected a refusal');

    expect(decision.error.code).toBe('OTP_RATE_LIMITED');
    expect(decision.error.scope).toBe('email');
  });

  /**
   * The limiter runs BEFORE the provider and is never told whether the address
   * exists, so it cannot vary with registration status. This asserts the
   * structural property: identical request sequences produce identical answers.
   */
  it('behaves identically for a registered and an unregistered address', async () => {
    const run = async (email: string) => {
      const time = clock();
      const limiter = limiterAt(time);
      const outcomes: boolean[] = [];
      for (let i = 0; i < OTP_RATE_LIMIT.email.limit + 2; i += 1) {
        outcomes.push((await send(limiter, email)).allowed);
      }
      return outcomes;
    };

    expect(await run('registered@example.com')).toEqual(await run('never-seen@example.com'));
  });

  it('carries no em dash', () => {
    expect(RATE_LIMITED_MESSAGE).not.toContain('—');
  });
});

describe('limiter state holds no plaintext identifiers', () => {
  it('keys on a digest, so a state dump names neither the address nor the source', async () => {
    const time = clock();
    const store = new InMemoryOtpRateLimitStore();
    const limiter = limiterAt(time, store);

    await send(limiter, 'someone@example.com', IP);

    const dump = JSON.stringify(store.keys());
    expect(dump).not.toContain('someone@example.com');
    expect(dump).not.toContain(IP);
  });
});

describe('failure modes', () => {
  it('fails closed when the limiter state cannot be read', async () => {
    const time = clock();
    const broken: OtpRateLimitStore = {
      countSince: async () => {
        throw new Error('state unavailable');
      },
      record: async () => {},
    };

    const decision = await createOtpRateLimiter({ store: broken, now: time.now }).check({
      email: 'user@example.com',
      ip: IP,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.error.scope).toBe('store');
    expect(decision.allowed === false && decision.error.message).toBe(RATE_LIMITED_MESSAGE);
  });

  it('fails closed when the limiter state cannot be written', async () => {
    const time = clock();
    const broken: OtpRateLimitStore = {
      countSince: async () => 0,
      record: async () => {
        throw new Error('state unavailable');
      },
    };

    const decision = await createOtpRateLimiter({ store: broken, now: time.now }).check({
      email: 'user@example.com',
      ip: IP,
    });

    expect(decision.allowed).toBe(false);
  });

  it('refuses an unusable address rather than turning it into a bucket key', async () => {
    const time = clock();
    const limiter = limiterAt(time);

    expect((await send(limiter, '   ')).allowed).toBe(false);
    expect((await send(limiter, 'x'.repeat(400) + '@example.com')).allowed).toBe(false);
  });

  it('says the address is the problem when the address is the problem', async () => {
    const time = clock();
    const decision = await send(limiterAt(time), '   ');

    expect(decision.allowed === false && decision.error.scope).toBe('address');
    expect(decision.allowed === false && decision.error.message).toBe(BAD_EMAIL_MESSAGE);
  });

  /** GoTrue is the authority on what a deliverable address looks like. */
  it('leaves the syntax of a plausible address to the provider', async () => {
    const time = clock();

    expect((await send(limiterAt(time), 'bob@localhost')).allowed).toBe(true);
  });
});

describe('InMemoryOtpRateLimitStore', () => {
  it('counts only the hits inside the window', async () => {
    const store = new InMemoryOtpRateLimitStore();
    await store.record('k', 1_000);
    await store.record('k', 2_000);

    expect(await store.countSince('k', 0)).toBe(2);
    expect(await store.countSince('k', 1_500)).toBe(1);
    expect(await store.countSince('k', 3_000)).toBe(0);
  });

  it('stays bounded, so a flood of keys cannot exhaust memory', async () => {
    const store = new InMemoryOtpRateLimitStore({ maxKeys: 10 });

    for (let i = 0; i < 100; i += 1) await store.record(`k${i}`, i);

    expect(store.keys().length).toBeLessThanOrEqual(10);
  });

  it('clears on reset', async () => {
    const store = new InMemoryOtpRateLimitStore();
    await store.record('k', 1_000);

    store.reset();

    expect(await store.countSince('k', 0)).toBe(0);
  });
});

describe('clientIpFromHeaders', () => {
  const headersOf = (map: Record<string, string>) => ({ get: (k: string) => map[k] ?? null });

  it('takes the first hop of x-forwarded-for', () => {
    expect(clientIpFromHeaders(headersOf({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }))).toBe(
      '203.0.113.7',
    );
  });

  it('falls back to x-real-ip', () => {
    expect(clientIpFromHeaders(headersOf({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('returns null when no source header is present', () => {
    expect(clientIpFromHeaders(headersOf({}))).toBeNull();
  });

  it('rejects a header that is not an address, rather than keying on it', () => {
    expect(clientIpFromHeaders(headersOf({ 'x-forwarded-for': 'x'.repeat(5_000) }))).toBeNull();
    expect(clientIpFromHeaders(headersOf({ 'x-forwarded-for': 'drop table runs' }))).toBeNull();
  });

  it('accepts an ipv6 address', () => {
    expect(clientIpFromHeaders(headersOf({ 'x-forwarded-for': '2001:db8::1' }))).toBe(
      '2001:db8::1',
    );
  });
});
