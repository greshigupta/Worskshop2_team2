import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, type Priority, type RecurrencePattern } from '@/lib/db';
import { isFutureDate } from '@/lib/timezone';

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const VALID_PATTERNS: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];

// GET /api/todos — list all todos for the current user
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const todos = todoDB.getAll(session.userId);
  return NextResponse.json(todos);
}

// POST /api/todos — create a new todo
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { title?: unknown; description?: unknown; due_date?: unknown; priority?: unknown; is_recurring?: unknown; recurrence_pattern?: unknown; reminder_minutes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate title
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'title is required and must be non-empty' }, { status: 400 });
  }
  if (title.length > 500) {
    return NextResponse.json({ error: 'title must be 500 characters or fewer' }, { status: 400 });
  }

  // Validate description
  const description =
    body.description !== undefined && body.description !== null
      ? String(body.description).trim()
      : undefined;
  if (description !== undefined && description.length > 2000) {
    return NextResponse.json({ error: 'description must be 2000 characters or fewer' }, { status: 400 });
  }

  // Validate due_date
  let due_date: string | undefined;
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
    due_date = body.due_date;
  }

  // Validate priority
  let priority: Priority | undefined;
  if (body.priority !== undefined) {
    if (typeof body.priority !== 'string' || !VALID_PRIORITIES.includes(body.priority as Priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }
    priority = body.priority as Priority;
  }

  // Validate recurrence
  const is_recurring = body.is_recurring === true || body.is_recurring === 1;
  let recurrence_pattern: RecurrencePattern | undefined;
  if (is_recurring) {
    if (!due_date) {
      return NextResponse.json({ error: 'Recurring todos require a due date' }, { status: 400 });
    }
    if (
      typeof body.recurrence_pattern !== 'string' ||
      !VALID_PATTERNS.includes(body.recurrence_pattern as RecurrencePattern)
    ) {
      return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 });
    }
    recurrence_pattern = body.recurrence_pattern as RecurrencePattern;
  }

  // Validate reminder_minutes
  let reminder_minutes: number | null = null;
  if (body.reminder_minutes !== undefined && body.reminder_minutes !== null && body.reminder_minutes !== '') {
    const rm = Number(body.reminder_minutes);
    const VALID_REMINDER_VALUES = [15, 30, 60, 120, 1440, 2880, 10080];
    if (!VALID_REMINDER_VALUES.includes(rm)) {
      return NextResponse.json({ error: 'Invalid reminder_minutes value' }, { status: 400 });
    }
    if (!due_date) {
      return NextResponse.json({ error: 'Reminder requires a due date' }, { status: 400 });
    }
    reminder_minutes = rm;
  }

  const todo = todoDB.create(session.userId, { title, description, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes });
  return NextResponse.json(todo, { status: 201 });
}
