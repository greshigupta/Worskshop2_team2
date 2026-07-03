import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB, todoDB } from '@/lib/db';

type Params = Promise<{ id: string }>;

// POST /api/todos/[id]/tags — replace all tag associations
// Body: { tagIds: number[] }
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = Number(id);
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 });
  }

  // Verify todo belongs to user
  const todo = todoDB.getById(session.userId, todoId);
  if (!todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  let body: { tagIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.tagIds)) {
    return NextResponse.json({ error: 'tagIds must be an array' }, { status: 400 });
  }

  const tagIds = body.tagIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  tagDB.setForTodo(session.userId, todoId, tagIds);

  const tags = tagDB.getForTodo(session.userId, todoId);
  return NextResponse.json({ tags });
}

// DELETE /api/todos/[id]/tags — remove a single tag
// Body: { tagId: number }
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = Number(id);
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 });
  }

  let body: { tagId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tagId = Number(body.tagId);
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return NextResponse.json({ error: 'tagId is required' }, { status: 400 });
  }

  tagDB.removeFromTodo(session.userId, todoId, tagId);
  const tags = tagDB.getForTodo(session.userId, todoId);
  return NextResponse.json({ tags });
}
