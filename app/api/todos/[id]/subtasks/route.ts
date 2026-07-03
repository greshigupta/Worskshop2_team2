import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { subtaskDB } from '@/lib/db';

type Params = Promise<{ id: string }>;

// POST /api/todos/[id]/subtasks — create a subtask for a todo
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

  let body: { title?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'title is required and must be non-empty' }, { status: 400 });
  }
  if (title.length > 500) {
    return NextResponse.json({ error: 'title must be 500 characters or fewer' }, { status: 400 });
  }

  const subtask = subtaskDB.create(todoId, session.userId, { title });
  if (!subtask) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json(subtask, { status: 201 });
}
