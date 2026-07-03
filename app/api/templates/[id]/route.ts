import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';

type Params = Promise<{ id: string }>;

// PUT /api/templates/[id]
export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const templateId = Number(id);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updated = templateDB.update(session.userId, templateId, {
    name: body.name !== undefined ? String(body.name) : undefined,
    description: body.description !== undefined ? String(body.description) : undefined,
    category: body.category !== undefined ? String(body.category) : undefined,
    title: body.title !== undefined ? String(body.title) : undefined,
    notes: body.notes !== undefined ? String(body.notes) : undefined,
    priority: body.priority !== undefined
      ? (body.priority as 'high' | 'medium' | 'low') : undefined,
    is_recurring: body.is_recurring !== undefined ? Boolean(body.is_recurring) : undefined,
    recurrence_pattern: body.recurrence_pattern !== undefined
      ? (body.recurrence_pattern as 'daily' | 'weekly' | 'monthly' | 'yearly' | null) : undefined,
    reminder_minutes: body.reminder_minutes !== undefined
      ? (body.reminder_minutes === null ? null : Number(body.reminder_minutes)) : undefined,
    due_date_offset_days: body.due_date_offset_days !== undefined
      ? (body.due_date_offset_days === null ? null : Number(body.due_date_offset_days)) : undefined,
    subtasks: body.subtasks !== undefined
      ? (body.subtasks as { title: string; position: number }[]) : undefined,
  });

  if (!updated) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return NextResponse.json(updated);
}

// DELETE /api/templates/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const deleted = templateDB.delete(session.userId, Number(id));
  if (!deleted) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
