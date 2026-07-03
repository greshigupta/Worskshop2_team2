import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const COOKIE_NAME = 'session';
const SESSION_DURATION_DAYS = 7;

export interface Session {
  userId: number;
  username: string;
}

/**
 * Reads and verifies the JWT session cookie.
 * Returns the Session payload, or null if absent/invalid.
 */
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

/**
 * Creates a signed JWT and sets it as an HTTP-only cookie.
 */
export function createSessionCookie(session: Session): string {
  const token = jwt.sign(session, JWT_SECRET, {
    expiresIn: `${SESSION_DURATION_DAYS}d`,
  });
  return token;
}
