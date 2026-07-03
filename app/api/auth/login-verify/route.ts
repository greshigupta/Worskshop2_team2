import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB } from '@/lib/db';
import { challengeStore } from '@/lib/challenge-store';
import { createSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { username, response } = await request.json();

  const user = userDB.getByUsername(username?.trim());
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const expectedChallenge = challengeStore.get(username.trim());
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
  }

  const authenticator = authenticatorDB.getByCredentialId(response.id);
  if (!authenticator || authenticator.user_id !== user.id) {
    return NextResponse.json({ error: 'Authenticator not found' }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: process.env.RP_ORIGIN ?? 'http://localhost:3000',
      expectedRPID:   process.env.RP_ID     ?? 'localhost',
      credential: {
        id:        authenticator.credential_id,
        publicKey: isoBase64URL.toBuffer(authenticator.credential_public_key),
        counter:   authenticator.counter ?? 0,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  challengeStore.delete(username.trim());
  authenticatorDB.updateCounter(authenticator.id, verification.authenticationInfo.newCounter ?? 0);

  await createSession({ userId: user.id, username: user.username });
  return NextResponse.json({ success: true });
}
