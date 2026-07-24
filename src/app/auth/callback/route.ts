import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Auth callback — the return target for both the magic-link email and the GitHub
 * OAuth redirect. Exchanges the one-time `code` for a session (cookies are set by
 * the cookie-bound server client) and forwards to `next` (default `/account`). On
 * any failure it bounces to the sign-in page with an error marker rather than
 * leaving the user on a blank callback.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/account';

  if (code) {
    const supabase = await createServerSupabase();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/sign-in?error=auth`);
}
