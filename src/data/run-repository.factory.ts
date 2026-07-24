import { getSupabaseConfig } from '@/config/env';
import { createServerSupabase } from '@/lib/supabase/server';
import { InMemoryRunRepository, type RunRepository } from './run-repository';
import { SupabaseRunRepository } from './run-repository.supabase';

/**
 * Resolve the run persistence: the Supabase adapter (RLS-scoped to the caller's
 * session) when auth is configured, otherwise the in-memory adapter. Server-only
 * (uses the cookie-bound client). The in-memory fallback is always empty — there
 * are no live runs without auth — so a fresh instance per call is fine.
 */
export async function getRunRepository(): Promise<RunRepository> {
  const supabase = getSupabaseConfig() ? await createServerSupabase() : null;
  return supabase ? new SupabaseRunRepository(supabase) : new InMemoryRunRepository();
}
