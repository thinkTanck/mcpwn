import { NextResponse, type NextRequest } from 'next/server';

/**
 * Exposes the request pathname to Server Components via an `x-pathname` header,
 * so the command deck can compute its active link server-side — no client
 * `usePathname`, which keeps the shell free of client JS (fast LCP).
 */
export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
