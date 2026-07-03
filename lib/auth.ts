import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET  = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const COOKIE_NAME = 'session';

export interface Session {
  userId: number;
  username: string;
}

export type SessionPayload = Session;

export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET) as Session & jwt.JwtPayload;
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}

export async function createSession(payload: Session): Promise<void> {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60,
    path:     '/',
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Legacy helper used by dev-login route. */
export function createSessionCookie(session: Session): string {
  return jwt.sign(session, JWT_SECRET, { expiresIn: '7d' });
}
