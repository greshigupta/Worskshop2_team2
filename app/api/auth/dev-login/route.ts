import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSessionCookie } from '@/lib/auth';
import { userDB } from '@/lib/db';

/**
 * DEV-ONLY: POST /api/auth/dev-login
 * Creates or finds a user and sets a session cookie.
 * Remove or gate this behind NODE_ENV before production.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const user = userDB.findOrCreate('dev-user');
  const token = createSessionCookie({ userId: user.id, username: user.username });

  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true, userId: user.id, username: user.username });
}
