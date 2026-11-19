import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/session';

export async function proxy(request) {
  if (request.nextUrl.hostname === 'sistemadetreino.vercel.app') {
    const destination = new URL(request.url);
    destination.protocol = 'https:';
    destination.hostname = 'www.atlasfit.com.br';
    destination.port = '';
    return NextResponse.redirect(destination, 308);
  }

  const pathname = request.nextUrl.pathname;
  if (['/login', '/register', '/forgot-password', '/privacy', '/icon.jpeg'].includes(pathname) || pathname.startsWith('/api/')) return NextResponse.next();
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session?.sub) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
