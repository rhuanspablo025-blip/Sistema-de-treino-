import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/session';

export async function proxy(request) {
  const pathname = request.nextUrl.pathname;
  if (['/login', '/register', '/forgot-password', '/privacy'].includes(pathname) || pathname.startsWith('/api/')) return NextResponse.next();
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session?.sub) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };