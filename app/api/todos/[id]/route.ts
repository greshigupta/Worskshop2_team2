import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, type Priority } from '@/lib/db';
import { isFutureDate } from '@/lib/timezone';

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];

type Params = Promise<{ id: string }>;

// GET /api/todos/[id] — get a single todo
export async function GET(_request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = Number(id);
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const todo = todoDB.getById(session.userId, todoId);
  if (!todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json(todo);
}

// PUT /api/todos/[id] — update a todo
export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = Number(id);
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: {
    title?: unknown;
    description?: unknown;
    completed?: unknown;
    due_date?: unknown;
    priority?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate title if provided
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'title must be non-empty' }, { status: 400 });
    }
    if (title.length > 500) {
      return NextResponse.json({ error: 'title must be 500 characters or fewer' }, { status: 400 });
    }
  }

  // Validate description if provided
  if (body.description !== undefined && body.description !== null) {
    const desc = String(body.description).trim();
    if (desc.length > 2000) {
      return NextResponse.json(
        { error: 'description must be 2000 characters or fewer' },
        { status: 400 },
      );
    }
  }

  // Validate due_date if provided (null means clear it)
  if (body.due_date !== undefined && body.due_date !== null && body.due_date !== '') {
    if (typeof body.due_date !== 'string') {
      return NextResponse.json({ error: 'due_date must be an ISO date string' }, { status: 400 });
    }
    if (isNaN(Date.parse(body.due_date))) {
      return NextResponse.json({ error: 'due_date is not a valid date' }, { status: 400 });
    }
    if (!isFutureDate(body.due_date)) {
      return NextResponse.json(
        { error: 'due_date must be at least 1 minute in the future' },
        { status: 400 },
      );
    }
  }

  const input: {
    title?: string;
    description?: string;
    completed?: boolean;
    due_date?: string | null;
    priority?: Priority;
  } = {};

  if (body.title !== undefined) input.title = String(body.title).trim();
  if (body.description !== undefined)
    input.description = body.description === null ? '' : String(body.description).trim();
  if (body.completed !== undefined) input.completed = Boolean(body.completed);
  if (body.due_date !== undefined)
    input.due_date =
      body.due_date === null || body.due_date === '' ? null : String(body.due_date);
  if (body.priority !== undefined) {
    if (typeof body.priority !== 'string' || !VALID_PRIORITIES.includes(body.priority as Priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }
    input.priority = body.priority as Priority;
  }

  const updated = todoDB.update(session.userId, todoId, input);
  if (!updated) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

// DELETE /api/todos/[id] — delete a todo
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = Number(id);
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const deleted = todoDB.delete(session.userId, todoId);
  if (!deleted) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
