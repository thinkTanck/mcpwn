import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseConfig } from '@/config/env';

/**
 * Refresh the Supabase session on every request and forward it to Server
 * Components via cookies, while preserving the `x-pathname` request header the
 * app shell reads for its active nav. Offline-safe: with auth inert (no Supabase
 * config) it just passes the request through unchanged.
 *
 * Edge-runtime only (uses request/response cookies, not next/headers) — exercised
 * by the build + e2e, so it is excluded from unit coverage like the other
 * edge/document-level files.
 */
export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<NextResponse> {
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const cfg = getSupabaseConfig();
  if (!cfg) return response; // auth not configured → passthrough

  const supabase = createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        response = NextResponse.next({ request: { headers: requestHeaders } });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Touching the user refreshes the session cookie — required for SSR auth to
  // stay valid across requests.
  await supabase.auth.getUser();
  return response;
}
