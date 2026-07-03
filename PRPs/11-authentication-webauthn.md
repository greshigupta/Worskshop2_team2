# PRP 11 — Authentication (WebAuthn / Passkeys)

## Feature Overview
The app uses **passwordless authentication** via WebAuthn (Passkeys). Users register and log in using their device's biometric authenticator (fingerprint, Face ID, Windows Hello). Sessions are managed with HTTP-only JWT cookies (7-day expiry). All routes except `/login` are protected by middleware.

---

## User Stories
- As a user, I want to register with my fingerprint/Face ID so I don't need a password.
- As a user, I want to log in with my passkey so access is fast and secure.
- As a user, I want my session to persist for 7 days so I don't have to re-authenticate daily.
- As a user, I want protected routes to redirect me to the login page when I'm not authenticated.

---

## User Flow

### Registration
1. User navigates to `/login`
2. Enters a **username** (display name — no password)
3. Clicks **"Register with Passkey"**
4. Browser shows biometric / platform authenticator prompt
5. On success: session cookie set, user redirected to `/`

### Login
1. User navigates to `/login`
2. Enters username
3. Clicks **"Login with Passkey"**
4. Browser shows authenticator prompt
5. On success: session cookie set, user redirected to `/`

### Logout
1. User clicks "Logout" in the app
2. `POST /api/auth/logout` called → session cookie cleared
3. User redirected to `/login`

### Protected Route Access Without Session
1. User navigates to `/` or `/calendar` without a valid session
2. Middleware redirects to `/login`

---

## Technical Requirements

### Dependencies

```bash
npm install @simplewebauthn/server @simplewebauthn/browser jsonwebtoken
npm install -D @types/jsonwebtoken
```

### Environment Variables

```env
# .env.local
JWT_SECRET=your-random-32+-char-secret-key
RP_ID=localhost                           # production: your domain e.g. todoapp.railway.app
RP_NAME=Todo App
RP_ORIGIN=http://localhost:3000           # production: https://todoapp.railway.app
```

### Database Schema (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT    NOT NULL UNIQUE,
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS authenticators (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id        TEXT    NOT NULL UNIQUE,   -- base64url encoded
  credential_public_key TEXT   NOT NULL,          -- base64url encoded
  counter              INTEGER NOT NULL DEFAULT 0,
  transports           TEXT,                       -- JSON array string
  created_at           TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);
CREATE INDEX IF NOT EXISTS idx_authenticators_credential_id ON authenticators(credential_id);
```

### TypeScript Interfaces

```typescript
export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: string;
  counter: number;
  transports: string | null;   // JSON string of AuthenticatorTransport[]
  created_at: string;
}
```

### Database Methods

```typescript
export const userDB = {
  create(username: string): User,
  getByUsername(username: string): User | null,
  getById(id: number): User | null,
};

export const authenticatorDB = {
  create(userId: number, data: {
    credential_id: string;
    credential_public_key: string;
    counter: number;
    transports?: string;
  }): Authenticator,
  getByCredentialId(credentialId: string): Authenticator | null,
  getByUserId(userId: number): Authenticator[],
  updateCounter(id: number, counter: number): void,
};
```

### Session Management (`lib/auth.ts`)

```typescript
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET  = process.env.JWT_SECRET!;
const COOKIE_NAME = 'session';

export interface SessionPayload {
  userId:   number;
  username: string;
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly:  true,
    secure:    process.env.NODE_ENV === 'production',
    sameSite:  'lax',
    maxAge:    7 * 24 * 60 * 60,   // 7 days in seconds
    path:      '/',
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
```

### Middleware (`middleware.ts`)

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET    = new TextEncoder().encode(process.env.JWT_SECRET!);
const PROTECTED     = ['/', '/calendar'];
const PUBLIC        = ['/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected  = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'));

  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', request.url));

  try {
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/', '/calendar', '/calendar/:path*'],
};
```

> Note: middleware uses `jose` (Edge-compatible) not `jsonwebtoken` (Node-only).  
> Install: `npm install jose`

### API Route Implementations

#### In-Memory Challenge Store

```typescript
// lib/challenge-store.ts
// Simple in-memory store — adequate for single-instance dev/Railway deploy
// For multi-instance production use Redis or DB-backed challenges
const challenges = new Map<string, string>();

export const challengeStore = {
  set(username: string, challenge: string) {
    challenges.set(username, challenge);
  },
  get(username: string): string | undefined {
    return challenges.get(username);
  },
  delete(username: string) {
    challenges.delete(username);
  },
};
```

#### POST `/api/auth/register-options`

```typescript
import { generateRegistrationOptions } from '@simplewebauthn/server';

export async function POST(request: NextRequest) {
  const { username } = await request.json();
  if (!username?.trim()) return NextResponse.json({ error: 'Username required' }, { status: 400 });

  const existingUser = userDB.getByUsername(username);
  const userId       = existingUser?.id ?? Date.now(); // temp ID for new user

  const options = await generateRegistrationOptions({
    rpName:                  process.env.RP_NAME!,
    rpID:                    process.env.RP_ID!,
    userID:                  new TextEncoder().encode(String(userId)),
    userName:                username,
    attestationType:         'none',
    authenticatorSelection:  { residentKey: 'preferred', userVerification: 'preferred' },
    excludeCredentials:      existingUser
      ? authenticatorDB.getByUserId(existingUser.id).map(a => ({
          id:         a.credential_id,
          transports: JSON.parse(a.transports ?? '[]'),
        }))
      : [],
  });

  challengeStore.set(username, options.challenge);
  return NextResponse.json(options);
}
```

#### POST `/api/auth/register-verify`

```typescript
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

export async function POST(request: NextRequest) {
  const { username, response } = await request.json();

  const expectedChallenge = challengeStore.get(username);
  if (!expectedChallenge) return NextResponse.json({ error: 'Challenge expired' }, { status: 400 });

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: process.env.RP_ORIGIN!,
    expectedRPID:   process.env.RP_ID!,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  challengeStore.delete(username);

  let user = userDB.getByUsername(username);
  if (!user) {
    user = userDB.create(username);
  }

  const { credential } = verification.registrationInfo;
  authenticatorDB.create(user.id, {
    credential_id:         isoBase64URL.fromBuffer(credential.id),
    credential_public_key: isoBase64URL.fromBuffer(credential.publicKey),
    counter:               credential.counter ?? 0,              // CRITICAL: use ?? 0
    transports:            JSON.stringify(response.response.transports ?? []),
  });

  await createSession({ userId: user.id, username: user.username });
  return NextResponse.json({ success: true });
}
```

#### POST `/api/auth/login-options`

```typescript
import { generateAuthenticationOptions } from '@simplewebauthn/server';

export async function POST(request: NextRequest) {
  const { username } = await request.json();

  const user = userDB.getByUsername(username);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const authenticators = authenticatorDB.getByUserId(user.id);
  const options = await generateAuthenticationOptions({
    rpID:             process.env.RP_ID!,
    userVerification: 'preferred',
    allowCredentials: authenticators.map(a => ({
      id:         a.credential_id,
      transports: JSON.parse(a.transports ?? '[]'),
    })),
  });

  challengeStore.set(username, options.challenge);
  return NextResponse.json(options);
}
```

#### POST `/api/auth/login-verify`

```typescript
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

export async function POST(request: NextRequest) {
  const { username, response } = await request.json();

  const user = userDB.getByUsername(username);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const expectedChallenge = challengeStore.get(username);
  if (!expectedChallenge) return NextResponse.json({ error: 'Challenge expired' }, { status: 400 });

  const authenticator = authenticatorDB.getByCredentialId(response.id);
  if (!authenticator || authenticator.user_id !== user.id) {
    return NextResponse.json({ error: 'Authenticator not found' }, { status: 400 });
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin:   process.env.RP_ORIGIN!,
    expectedRPID:     process.env.RP_ID!,
    credential: {
      id:         isoBase64URL.toBuffer(authenticator.credential_id),
      publicKey:  isoBase64URL.toBuffer(authenticator.credential_public_key),
      counter:    authenticator.counter ?? 0,              // CRITICAL: use ?? 0
    },
  });

  if (!verification.verified) return NextResponse.json({ error: 'Verification failed' }, { status: 400 });

  challengeStore.delete(username);
  authenticatorDB.updateCounter(authenticator.id, verification.authenticationInfo.newCounter ?? 0);

  await createSession({ userId: user.id, username: user.username });
  return NextResponse.json({ success: true });
}
```

#### POST `/api/auth/logout`

```typescript
export async function POST() {
  await deleteSession();
  return NextResponse.json({ success: true });
}
```

#### GET `/api/auth/me`

```typescript
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ userId: session.userId, username: session.username });
}
```

### Login Page (`app/login/page.tsx`)

```tsx
'use client';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [error, setError]       = useState('');

  async function handleRegister() {
    const optRes = await fetch('/api/auth/register-options', {
      method: 'POST',
      body: JSON.stringify({ username }),
      headers: { 'Content-Type': 'application/json' },
    });
    const options = await optRes.json();
    const response = await startRegistration({ optionsJSON: options });
    const verRes = await fetch('/api/auth/register-verify', {
      method: 'POST',
      body: JSON.stringify({ username, response }),
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await verRes.json();
    if (result.success) router.push('/');
    else setError(result.error);
  }

  async function handleLogin() {
    const optRes = await fetch('/api/auth/login-options', {
      method: 'POST',
      body: JSON.stringify({ username }),
      headers: { 'Content-Type': 'application/json' },
    });
    const options = await optRes.json();
    const response = await startAuthentication({ optionsJSON: options });
    const verRes = await fetch('/api/auth/login-verify', {
      method: 'POST',
      body: JSON.stringify({ username, response }),
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await verRes.json();
    if (result.success) router.push('/');
    else setError(result.error);
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm p-6 bg-white rounded-xl shadow">
        <h1 className="text-2xl font-bold mb-6">Todo App</h1>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full border rounded px-3 py-2 mb-4"
        />
        <div className="flex gap-2">
          <button onClick={handleRegister} className="flex-1 bg-blue-600 text-white rounded px-4 py-2">
            Register
          </button>
          <button onClick={handleLogin} className="flex-1 bg-gray-600 text-white rounded px-4 py-2">
            Login
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-4 text-center">
          Uses passkeys — no password required
        </p>
      </div>
    </div>
  );
}
```

---

## Critical Implementation Notes

| ⚠️ Pitfall | Correct Pattern |
|-----------|-----------------|
| `counter` may be `undefined` | Always use `counter ?? 0` when reading or writing |
| `jsonwebtoken` in middleware | Use `jose` instead (Edge runtime compatible) |
| `params` in Next.js 16 | `const { id } = await params` (it's a Promise) |
| HTTPS required for production WebAuthn | `RP_ORIGIN` must be `https://` in production |
| Same challenge for concurrent logins | Challenge is per-username; concurrent logins on same username may conflict |

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Username already taken on register | Authenticator added to existing user (multi-device) |
| Challenge expired or missing | Return `400 Challenge expired` |
| Authenticator from different user | Return `400 Authenticator not found` |
| JWT expired | `getSession()` returns null; middleware redirects to login |
| Browser doesn't support WebAuthn | Show error message: "Your browser does not support passkeys" |
| User navigates to `/login` with valid session | Optionally redirect to `/` (check with `getSession()` on login page load) |

---

## Acceptance Criteria

- [ ] Register with passkey creates user in DB
- [ ] Login with passkey sets HTTP-only session cookie
- [ ] Session persists for 7 days
- [ ] Logout clears cookie and redirects to `/login`
- [ ] Accessing `/` without session redirects to `/login`
- [ ] Accessing `/calendar` without session redirects to `/login`
- [ ] Login page redirects authenticated users to `/`
- [ ] Counter updated on each login (prevents replay attacks)

---

## Testing Requirements

### E2E Tests (`tests/01-authentication.spec.ts`)
```typescript
// Uses Playwright virtual WebAuthn authenticator
test('register new user — redirected to home')
test('login existing user — redirected to home')
test('logout — session cleared, redirected to login')
test('access / without auth — redirected to login')
test('access /calendar without auth — redirected to login')
test('login page with valid session — redirected to /')
```

**Playwright virtual authenticator setup:**
```typescript
// playwright.config.ts
use: {
  timezoneId: 'Asia/Singapore',
  launchOptions: {
    args: [
      '--enable-features=WebAuthenticationVirtualAuthenticator'
    ]
  }
}

// tests/helpers.ts
export async function setupVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  return { client, authenticatorId };
}
```

### Unit Tests
```typescript
test('createSession: sets HTTP-only cookie')
test('getSession: returns payload for valid JWT')
test('getSession: returns null for expired JWT')
test('getSession: returns null for missing cookie')
test('deleteSession: clears cookie')
```

---

## Deployment Environment Variables

| Variable | Dev value | Production value |
|----------|-----------|-----------------|
| `JWT_SECRET` | any 32+ char string | random secret (keep private) |
| `RP_ID` | `localhost` | `your-app.railway.app` |
| `RP_NAME` | `Todo App` | `Todo App` |
| `RP_ORIGIN` | `http://localhost:3000` | `https://your-app.railway.app` |

---

## Out of Scope
- Traditional username/password fallback
- OAuth (Google, GitHub, etc.)
- Multi-factor authentication beyond WebAuthn
- Account recovery

---

## Success Metrics
- Registration completes in < 2 seconds (including authenticator interaction)
- Login completes in < 2 seconds
- Zero unauthorised access to protected routes
- Session cookie never exposed via JavaScript (`httpOnly: true`)
