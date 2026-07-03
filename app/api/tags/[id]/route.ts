import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';

type Params = Promise<{ id: string }>;

// PUT /api/tags/[id] — update tag name or colour
export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const tagId = Number(id);
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 });
  }

  let body: { name?: unknown; color?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'name must be non-empty' }, { status: 400 });
    }
    if (name.length > 50) {
      return NextResponse.json({ error: 'name must be 50 characters or fewer' }, { status: 400 });
    }
  }

  try {
    const updated = tagDB.update(session.userId, tagId, {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      color: body.color !== undefined ? String(body.color) : undefined,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
    }
    throw e;
  }
}

// DELETE /api/tags/[id] — delete tag (CASCADE removes from todo_tags)
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const tagId = Number(id);
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 });
  }

  const deleted = tagDB.delete(session.userId, tagId);
  if (!deleted) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
