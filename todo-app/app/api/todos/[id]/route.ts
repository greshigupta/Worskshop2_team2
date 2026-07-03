import { NextRequest, NextResponse } from 'next/server'
import { todoDB, VALID_PRIORITIES, VALID_PATTERNS } from '@/lib/db'
import type { Priority, RecurrencePattern } from '@/lib/db'
import { calculateNextDueDate } from '@/lib/recurrence'

type Params = Promise<{ id: string }>

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const todoId  = parseInt(id, 10)

  if (isNaN(todoId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const existing = todoDB.getById(todoId)
  if (!existing) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, description, completed, priority, due_date, is_recurring, recurrence_pattern } = body as {
    title?:              string
    description?:        string | null
    completed?:          boolean
    priority?:           Priority
    due_date?:           string | null
    is_recurring?:       boolean
    recurrence_pattern?: RecurrencePattern | null
  }

  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
  }

  const recurringEnabled = is_recurring !== undefined ? is_recurring : existing.is_recurring
  if (recurringEnabled) {
    const effectiveDueDate = due_date !== undefined ? due_date : existing.due_date
    if (!effectiveDueDate) {
      return NextResponse.json({ error: 'Recurring todos require a due date' }, { status: 400 })
    }
    const effectivePattern = recurrence_pattern !== undefined ? recurrence_pattern : existing.recurrence_pattern
    if (!effectivePattern || !VALID_PATTERNS.includes(effectivePattern)) {
      return NextResponse.json({ error: 'Invalid or missing recurrence pattern' }, { status: 400 })
    }
  }

  const updated = todoDB.update(todoId, {
    title,
    description,
    completed,
    priority,
    due_date,
    is_recurring,
    recurrence_pattern,
  })

  // ── PRP 03: completing a recurring todo → spawn next instance ─────────────
  if (
    completed === true &&
    existing.is_recurring &&
    existing.recurrence_pattern &&
    existing.due_date
  ) {
    const nextDueDate = calculateNextDueDate(existing.due_date, existing.recurrence_pattern)
    todoDB.create({
      title:              existing.title,
      priority:           existing.priority,
      due_date:           nextDueDate,
      is_recurring:       true,
      recurrence_pattern: existing.recurrence_pattern,
    })
  }

  return NextResponse.json(updated)
}

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const todoId  = parseInt(id, 10)

  if (isNaN(todoId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const deleted = todoDB.delete(todoId)
  if (!deleted) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
