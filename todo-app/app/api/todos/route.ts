import { NextRequest, NextResponse } from 'next/server'
import { todoDB, VALID_PRIORITIES, VALID_PATTERNS } from '@/lib/db'
import type { Priority, RecurrencePattern } from '@/lib/db'
import { isValidFutureDate } from '@/lib/timezone'

export async function GET() {
  const todos = todoDB.getAll()
  return NextResponse.json(todos)
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, description, priority, due_date, is_recurring, recurrence_pattern } = body as {
    title?:              string
    description?:        string
    priority?:           Priority
    due_date?:           string
    is_recurring?:       boolean
    recurrence_pattern?: RecurrencePattern
  }

  if (!title || !title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  if (title.trim().length > 500) {
    return NextResponse.json({ error: 'Title must be 500 characters or fewer' }, { status: 400 })
  }
  if (description && description.length > 2000) {
    return NextResponse.json({ error: 'Description must be 2000 characters or fewer' }, { status: 400 })
  }

  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: 'Invalid priority. Must be high, medium, or low.' }, { status: 400 })
  }

  if (due_date && !isValidFutureDate(due_date)) {
    return NextResponse.json(
      { error: 'Due date must be at least 1 minute in the future' },
      { status: 400 },
    )
  }

  if (is_recurring) {
    if (!due_date) {
      return NextResponse.json({ error: 'Recurring todos require a due date' }, { status: 400 })
    }
    if (!recurrence_pattern || !VALID_PATTERNS.includes(recurrence_pattern)) {
      return NextResponse.json({ error: 'Invalid or missing recurrence pattern' }, { status: 400 })
    }
  }

  const todo = todoDB.create({
    title:              title.trim(),
    description:        description?.trim() || null,
    priority:           priority           ?? 'medium',
    due_date:           due_date           ?? null,
    is_recurring:       !!is_recurring,
    recurrence_pattern: is_recurring ? recurrence_pattern : null,
  })

  return NextResponse.json(todo, { status: 201 })
}
