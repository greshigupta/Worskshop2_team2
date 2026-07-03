import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB } from '@/lib/db';
import { challengeStore } from '@/lib/challenge-store';
import { createSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { username, response } = await request.json();

  const expectedChallenge = challengeStore.get(username);
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: process.env.RP_ORIGIN ?? 'http://localhost:3000',
      expectedRPID:   process.env.RP_ID     ?? 'localhost',
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

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
    credential_id:         credential.id,                              // already base64url string in v12
    credential_public_key: isoBase64URL.fromBuffer(credential.publicKey), // Uint8Array → base64url
    counter:               credential.counter ?? 0,
    transports:            JSON.stringify(response.response?.transports ?? []),
  });

  await createSession({ userId: user.id, username: user.username });
  return NextResponse.json({ success: true });
}
