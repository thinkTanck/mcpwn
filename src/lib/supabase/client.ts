import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig } from '@/config/env';

/**
 * Browser Supabase client (public url + anon key, RLS-scoped). Returns `null`
 * when auth is not configured (offline), so callers keep the sign-in preview
 * path instead of constructing a dead client. Only the public NEXT_PUBLIC_
 * values are read, so nothing secret can reach the bundle.
 */
export function createBrowserSupabase() {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  return createBrowserClient(cfg.url, cfg.anonKey);
}
