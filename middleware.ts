import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'perler_auth';

async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`perler:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login'
    || pathname === '/api/login'
    || pathname.startsWith('/_next/')
    || pathname.startsWith('/favicon')
    || pathname.startsWith('/icon-')
    || pathname === '/manifest.json'
    || pathname === '/sw.js'
    || pathname === '/workbox-cb477421.js'
  );
}

export async function middleware(request: NextRequest) {
  const password = process.env.PERLER_APP_PASSWORD;
  if (!password || isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const expectedToken = await authToken(password);
  const actualToken = request.cookies.get(AUTH_COOKIE)?.value;
  if (actualToken === expectedToken) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!.*\\..*).*)', '/api/:path*'],
};
