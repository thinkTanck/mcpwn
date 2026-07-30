import { createClient } from '@supabase/supabase-js';
import { createOtpSenderSupabase } from '@/lib/supabase/server';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth: {} })) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

/**
 * REGRESSION GUARD for the Slice 1.5 prod bug.
 *
 * `@supabase/ssr`'s `createServerClient` hardcodes `flowType: "pkce"` AFTER
 * spreading the caller's `auth` options, so it cannot be opted out of. Under
 * PKCE, auth-js attaches a `code_challenge` to `signInWithOtp` and GoTrue then
 * stores a flow-state auth code (`recovery_token = pkce_...`) INSTEAD of
 * `sha224(email + otp)`. The emailed code then has no hash to match and every
 * verify fails with "Token has expired or is invalid".
 *
 * So the code must be SENT by a plain supabase-js client on the implicit flow.
 * It needs no cookies: sending a code creates no session.
 */
describe('createOtpSenderSupabase (email OTP sender, non-PKCE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('builds the client on the implicit flow, never PKCE', () => {
    createOtpSenderSupabase();
    expect(createClient).toHaveBeenCalledTimes(1);
    const [url, key, options] = vi.mocked(createClient).mock.calls[0]!;
    expect(url).toBe('https://project.supabase.co');
    expect(key).toBe('anon-key');
    expect(options?.auth?.flowType).toBe('implicit');
  });

  it('persists no session (sending a code must not touch the cookie jar)', () => {
    createOtpSenderSupabase();
    const [, , options] = vi.mocked(createClient).mock.calls[0]!;
    expect(options?.auth?.persistSession).toBe(false);
  });

  it('uses the public anon key, never the service-role key', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
    createOtpSenderSupabase();
    const [, key] = vi.mocked(createClient).mock.calls[0]!;
    expect(key).not.toBe('service-role-secret');
  });

  it('is inert (null) when auth is not configured', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(createOtpSenderSupabase()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
});
