import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { subtaskDB } from '@/lib/db';

type Params = Promise<{ id: string }>;

// PUT /api/subtasks/[id] — update title or completed status
export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const subtaskId = Number(id);
  if (!Number.isInteger(subtaskId) || subtaskId <= 0) {
    return NextResponse.json({ error: 'Invalid subtask id' }, { status: 400 });
  }

  let body: { title?: unknown; completed?: unknown; todo_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const todoId = Number(body.todo_id);
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: 'todo_id is required' }, { status: 400 });
  }

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'title must be non-empty' }, { status: 400 });
    }
    if (title.length > 500) {
      return NextResponse.json({ error: 'title must be 500 characters or fewer' }, { status: 400 });
    }
  }

  const input: { title?: string; completed?: boolean } = {};
  if (body.title !== undefined) input.title = String(body.title).trim();
  if (body.completed !== undefined) input.completed = Boolean(body.completed);

  const updated = subtaskDB.update(subtaskId, todoId, session.userId, input);
  if (!updated) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

// DELETE /api/subtasks/[id] — delete a subtask
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const subtaskId = Number(id);
  if (!Number.isInteger(subtaskId) || subtaskId <= 0) {
    return NextResponse.json({ error: 'Invalid subtask id' }, { status: 400 });
  }

  // todo_id needed for ownership verification
  let body: { todo_id?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // DELETE may not have a body — allow it
  }

  const todoId = Number(body.todo_id);
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: 'todo_id is required' }, { status: 400 });
  }

  const deleted = subtaskDB.delete(subtaskId, todoId, session.userId);
  if (!deleted) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
