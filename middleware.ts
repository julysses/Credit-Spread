import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/', '/_next', '/favicon.ico', '/api/health'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /api routes
  if (!pathname.startsWith('/api')) return NextResponse.next();

  // Allow health check without auth
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next();

  const secret = process.env.API_SECRET;

  // If no secret configured, allow all (dev mode)
  if (!secret) return NextResponse.next();

  // Check Authorization header: Bearer <secret>
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Also accept as query param ?api_key=<secret> for browser convenience
  const queryKey = req.nextUrl.searchParams.get('api_key');

  if (token === secret || queryKey === secret) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export const config = {
  matcher: '/api/:path*',
};
