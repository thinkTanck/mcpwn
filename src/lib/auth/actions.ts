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

/** Same-site relative path only, else `/account` (open-redirect guard). `next`
 *  arrives from the untrusted `?next=` query param. */
function sanitizeNext(next?: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return '/account';
  }
  return next;
}

/**
 * Email OTP: send the address a 6-digit code (the Supabase email templates must
 * emit `{{ .Token }}`). Returns a typed result so the panel can advance to the
 * code step or show a failure without leaving the page. Inert (ok:false) when
 * auth is not configured — the panel keeps its preview state.
 */
export async function requestEmailCode(email: string): Promise<AuthResult> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: 'Sign-in is not configured yet.' };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Email OTP verify: exchange the typed 6-digit code for a session. Tries the
 * sign-in OTP type, then the signup OTP type (a brand-new account's first code).
 * On success the cookie-bound server client has set the session cookies, so we
 * redirect to a sanitized `next`. verifyOtp IS the whole flow — no PKCE, no
 * callback, so an email scanner or a different browser can never break it.
 */
export async function verifyEmailCode(
  email: string,
  token: string,
  next?: string,
): Promise<AuthResult> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: 'Sign-in is not configured yet.' };

  let { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) {
    ({ error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' }));
  }
  if (error) return { ok: false, error: error.message };

  redirect(sanitizeNext(next));
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
