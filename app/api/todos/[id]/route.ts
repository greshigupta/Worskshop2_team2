import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, type Priority, type RecurrencePattern } from '@/lib/db';
import { isFutureDate } from '@/lib/timezone';
import { calculateNextDueDate } from '@/lib/recurrence';

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const VALID_PATTERNS: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];

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
    is_recurring?: unknown;
    recurrence_pattern?: unknown;
    reminder_minutes?: unknown;
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
    is_recurring?: boolean;
    recurrence_pattern?: RecurrencePattern | null;
    reminder_minutes?: number | null;
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
  if (body.is_recurring !== undefined) {
    input.is_recurring = body.is_recurring === true || body.is_recurring === 1;
  }
  if (body.recurrence_pattern !== undefined) {
    if (
      body.recurrence_pattern !== null &&
      (typeof body.recurrence_pattern !== 'string' ||
        !VALID_PATTERNS.includes(body.recurrence_pattern as RecurrencePattern))
    ) {
      return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 });
    }
    input.recurrence_pattern =
      body.recurrence_pattern === null ? null : (body.recurrence_pattern as RecurrencePattern);
  }
  if (body.reminder_minutes !== undefined) {
    if (body.reminder_minutes === null || body.reminder_minutes === '') {
      input.reminder_minutes = null;
    } else {
      const VALID_REMINDER_VALUES = [15, 30, 60, 120, 1440, 2880, 10080];
      const rm = Number(body.reminder_minutes);
      if (!VALID_REMINDER_VALUES.includes(rm)) {
        return NextResponse.json({ error: 'Invalid reminder_minutes value' }, { status: 400 });
      }
      input.reminder_minutes = rm;
    }
  }

  // Validate recurrence consistency
  const willBeRecurring =
    input.is_recurring !== undefined ? input.is_recurring : false;
  const existingTodo = todoDB.getById(session.userId, todoId);
  if (!existingTodo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }
  const effectiveRecurring =
    input.is_recurring !== undefined ? input.is_recurring : existingTodo.is_recurring;
  const effectiveDueDate =
    input.due_date !== undefined ? input.due_date : existingTodo.due_date;
  if (effectiveRecurring && !effectiveDueDate) {
    return NextResponse.json({ error: 'Recurring todos require a due date' }, { status: 400 });
  }
  void willBeRecurring; // suppress unused var warning

  const updated = todoDB.update(session.userId, todoId, input);
  if (!updated) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // Spawn next instance when completing a recurring todo
  let nextTodo = null;
  if (input.completed === true && updated.is_recurring && updated.recurrence_pattern && updated.due_date) {
    const nextDueDate = calculateNextDueDate(updated.due_date, updated.recurrence_pattern);
    nextTodo = todoDB.create(session.userId, {
      title: updated.title,
      description: updated.description ?? undefined,
      priority: updated.priority,
      due_date: nextDueDate,
      is_recurring: true,
      recurrence_pattern: updated.recurrence_pattern,
      reminder_minutes: updated.reminder_minutes ?? null,
    });
  }

  return NextResponse.json({ todo: updated, nextTodo });
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
