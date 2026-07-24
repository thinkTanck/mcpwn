'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

/** Result the sign-in UI renders. Never leaks provider internals beyond `error`. */
export type AuthResult = { ok: true } | { ok: false; error: string };

/** Absolute site origin, from the (proxied) request headers — works on preview + prod. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Magic-link: email the address a one-time sign-in link that returns to
 * `/auth/callback`. Returns a typed result so the panel can show "check your
 * email" or a failure without leaving the page. Inert (ok:false) when auth is
 * not configured — the panel keeps its preview state.
 */
export async function sendMagicLink(email: string): Promise<AuthResult> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: 'Sign-in is not configured yet.' };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * GitHub OAuth: kick off the provider flow and redirect the browser to GitHub.
 * A no-op when auth is inert. The button that calls this is itself gated behind
 * isGithubOAuthEnabled, so this only runs once GitHub is configured.
 */
export async function startGitHubOAuth(): Promise<void> {
  const supabase = await createServerSupabase();
  if (!supabase) return;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error || !data?.url) return;
  redirect(data.url);
}

/** Sign out and return to the front door. */
export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect('/');
}
