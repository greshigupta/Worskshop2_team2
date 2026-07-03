import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { challengeStore } from '@/lib/challenge-store';

export async function POST(request: NextRequest) {
  const { username } = await request.json();
  if (!username?.trim()) {
    return NextResponse.json({ error: 'Username required' }, { status: 400 });
  }

  const existingUser = userDB.getByUsername(username.trim());
  const userId       = existingUser?.id ?? Date.now();

  const options = await generateRegistrationOptions({
    rpName:                 process.env.RP_NAME ?? 'Todo App',
    rpID:                   process.env.RP_ID   ?? 'localhost',
    userID:                 new TextEncoder().encode(String(userId)),
    userName:               username.trim(),
    attestationType:        'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    excludeCredentials: existingUser
      ? authenticatorDB.getByUserId(existingUser.id).map((a) => ({
          id:         a.credential_id,
          transports: JSON.parse(a.transports ?? '[]'),
        }))
      : [],
  });

  challengeStore.set(username.trim(), options.challenge);
  return NextResponse.json(options);
}
