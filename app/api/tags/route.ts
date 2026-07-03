import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';

// GET /api/tags — list all tags for the current user
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json(tagDB.getAll(session.userId));
}

// POST /api/tags — create a new tag
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { name?: unknown; color?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (name.length > 50) {
    return NextResponse.json({ error: 'name must be 50 characters or fewer' }, { status: 400 });
  }

  const color = typeof body.color === 'string' ? body.color : '#3B82F6';

  try {
    const tag = tagDB.create(session.userId, { name, color });
    return NextResponse.json(tag, { status: 201 });
  } catch (e: unknown) {
    // SQLite UNIQUE constraint violation
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
    }
    throw e;
  }
}
