import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';

// GET /api/templates
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json(templateDB.getAll(session.userId));
}

// POST /api/templates
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const template = templateDB.create(session.userId, {
    name,
    description: body.description ? String(body.description) : undefined,
    category: body.category ? String(body.category) : undefined,
    title,
    notes: body.notes ? String(body.notes) : undefined,
    priority: (['high', 'medium', 'low'].includes(body.priority as string)
      ? body.priority : 'medium') as 'high' | 'medium' | 'low',
    is_recurring: Boolean(body.is_recurring),
    recurrence_pattern: body.recurrence_pattern
      ? (body.recurrence_pattern as 'daily' | 'weekly' | 'monthly' | 'yearly') : null,
    reminder_minutes: body.reminder_minutes != null ? Number(body.reminder_minutes) : null,
    due_date_offset_days: body.due_date_offset_days != null ? Number(body.due_date_offset_days) : null,
    subtasks: Array.isArray(body.subtasks) ? body.subtasks as { title: string; position: number }[] : [],
  });

  return NextResponse.json(template, { status: 201 });
}
