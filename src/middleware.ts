import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Two jobs per request: (1) expose the pathname to Server Components via an
 * `x-pathname` header so the command deck computes its active link server-side
 * (no client `usePathname`, fast LCP), and (2) refresh the Supabase session so
 * SSR auth stays valid. `updateSession` carries the header through and is a
 * passthrough when auth is not configured (offline-safe).
 */
export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  return updateSession(request, requestHeaders);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
