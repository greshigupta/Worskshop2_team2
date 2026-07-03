import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB, todoDB, subtaskDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

type Params = Promise<{ id: string }>;

// POST /api/templates/[id]/use — create a new todo from this template
export async function POST(_request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.getById(session.userId, Number(id));
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  // Calculate due date from offset
  let due_date: string | undefined;
  if (template.due_date_offset_days != null) {
    const date = getSingaporeNow();
    date.setDate(date.getDate() + template.due_date_offset_days);
    due_date = date.toISOString();
  }

  const todo = todoDB.create(session.userId, {
    title: template.title,
    description: template.notes ?? undefined,
    priority: template.priority,
    due_date,
    is_recurring: template.is_recurring,
    recurrence_pattern: template.recurrence_pattern ?? undefined,
    reminder_minutes: template.reminder_minutes ?? null,
  });

  // Re-create subtasks from template JSON
  const subtasks: { title: string; position: number }[] = JSON.parse(
    template.subtasks_json ?? '[]',
  );
  const sortedSubtasks = [...subtasks].sort((a, b) => a.position - b.position);
  for (const s of sortedSubtasks) {
    subtaskDB.create(todo.id, session.userId, { title: s.title });
  }

  // Fetch with subtasks attached
  const fullTodo = todoDB.getById(session.userId, todo.id);
  return NextResponse.json(fullTodo, { status: 201 });
}
