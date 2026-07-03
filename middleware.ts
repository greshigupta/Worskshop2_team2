import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET    = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
);
const PROTECTED     = ['/', '/calendar'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some(
    (route) => pathname === route || pathname.startsWith(route + '/'),
  );

  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get('session')?.value;
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/', '/calendar', '/calendar/:path*'],
};
