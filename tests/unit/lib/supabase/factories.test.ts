import { createBrowserSupabase } from '@/lib/supabase/client';

/**
 * Offline-safe: with no Supabase env configured, the browser factory returns
 * null so the app stays on the sign-in preview path. (The server + admin
 * factories import next/headers and are exercised in the auth-flow increment.)
 */
describe('Supabase browser factory — inert when unconfigured', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('returns null when auth is not configured', () => {
    expect(createBrowserSupabase()).toBeNull();
  });
});
