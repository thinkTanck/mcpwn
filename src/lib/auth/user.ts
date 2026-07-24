import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * The signed-in user, or `null` — also null when auth is not configured
 * (offline). Reads the session from the cookie-bound server client.
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/**
 * Gate: the signed-in user, or a redirect to `/sign-in`. `next` is round-tripped
 * so the callback can return the user to the page they were reaching. Use this in
 * authed pages / server actions — it is the single choke-point for "must be
 * signed in".
 */
export async function requireUser(next?: string): Promise<User> {
  const user = await getUser();
  if (!user) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in');
  return user;
}
