/**
 * Which adapter a live run's stores use — decided the same way
 * `getRunRepository()` decides it, and for the same reason.
 *
 * THERE IS NO DRIVER SWITCH, deliberately. Selection is purely "is Supabase
 * configured", so a deployment cannot end up on the wrong store because an env
 * var was misspelt, and an offline clone still boots with no credentials at all.
 *
 * WHY THE ADMIN CLIENT, WHEN THE RUN REPOSITORY USES THE COOKIE-BOUND ONE. The
 * `runs` table has owner policies, so a user's own session is exactly the right
 * identity to read it with. These two tables have RLS on and ZERO policies, so no
 * session reaches them by design: a run token must never be re-readable by the
 * browser it was issued to, and the open-run registry is server bookkeeping the
 * agent has no business in. That leaves the service-role key, used server-side
 * only. Ownership is still checked in code — `verifyRunToken` binds the token to
 * one run AND one account, and the live-run host refuses another account's run —
 * so bypassing RLS does not mean skipping the check.
 *
 * A fresh adapter per call, like the run repository: the state that matters is in
 * Postgres, and the client object is cheap next to the work it is about to do.
 */
import { getSupabaseConfig } from '@/config/env';
import { createAdminSupabase } from '@/lib/supabase/server';
import { InMemoryLiveRunSessionStore, type LiveRunSessionStore } from '@/runs/live-run-store';
import { SupabaseLiveRunSessionStore } from '@/runs/live-run-store.supabase';
import { InMemoryRunTokenStore, type RunTokenStore } from '@/runs/run-token';
import { SupabaseRunTokenStore } from '@/runs/run-token.supabase';

/** The service-role client, or null when this deployment has no Supabase. */
function adminClient() {
  return getSupabaseConfig() ? createAdminSupabase() : null;
}

/** Where per-run connection tokens are written, read and revoked. */
export function getRunTokenStore(): RunTokenStore {
  const client = adminClient();
  return client ? new SupabaseRunTokenStore(client) : new InMemoryRunTokenStore();
}

/** The open-run registry: which runs exist, and what they have recorded. */
export function getLiveRunSessionStore(): LiveRunSessionStore {
  const client = adminClient();
  return client ? new SupabaseLiveRunSessionStore(client) : new InMemoryLiveRunSessionStore();
}
