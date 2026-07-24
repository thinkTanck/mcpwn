import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getSupabaseConfig, getSupabaseServiceRoleKey } from '@/config/env';

/**
 * Cookie-bound server Supabase client carrying the user's session. Returns `null`
 * when auth is not configured (offline). The `next/headers` import makes this
 * whole module server-only — the service-role admin client below can never reach
 * the browser bundle because a client import of this module fails to build.
 */
export async function createServerSupabase() {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  const store = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called during a Server Component render, where cookies are read-only.
          // The middleware refreshes the session cookie, so this write is a no-op.
        }
      },
    },
  });
}

/**
 * SERVER-ONLY admin client (service-role key — BYPASSES RLS). Returns `null` when
 * auth is not configured. Use only for privileged server operations; it must
 * never be exposed to the client. No session is persisted.
 */
export function createAdminSupabase() {
  const cfg = getSupabaseConfig();
  const key = getSupabaseServiceRoleKey();
  if (!cfg || !key) return null;
  return createClient(cfg.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
