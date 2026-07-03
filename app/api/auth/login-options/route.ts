import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { challengeStore } from '@/lib/challenge-store';

export async function POST(request: NextRequest) {
  const { username } = await request.json();

  const user = userDB.getByUsername(username?.trim());
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const authenticators = authenticatorDB.getByUserId(user.id);

  const options = await generateAuthenticationOptions({
    rpID:             process.env.RP_ID ?? 'localhost',
    userVerification: 'preferred',
    allowCredentials: authenticators.map((a) => ({
      id:         a.credential_id,
      transports: JSON.parse(a.transports ?? '[]'),
    })),
  });

  challengeStore.set(username.trim(), options.challenge);
  return NextResponse.json(options);
}
