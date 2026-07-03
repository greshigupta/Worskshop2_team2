import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, type Priority } from '@/lib/db';
import { isFutureDate } from '@/lib/timezone';

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];

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

  let body: { title?: unknown; description?: unknown; due_date?: unknown; priority?: unknown };
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

  const todo = todoDB.create(session.userId, { title, description, due_date, priority });
  return NextResponse.json(todo, { status: 201 });
}
