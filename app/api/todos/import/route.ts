import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, tagDB, subtaskDB } from '@/lib/db';

function validateExportFormat(data: unknown): string | null {
  if (!data || typeof data !== 'object') return 'File is not valid JSON';
  const d = data as Record<string, unknown>;
  if (d.version !== '1.0') return `Unsupported version: ${String(d.version)}`;
  if (!Array.isArray(d.todos)) return 'Missing todos array';
  if (!Array.isArray(d.tags)) return 'Missing tags array';
  return null;
}

// POST /api/todos/import — accepts ExportFormat JSON, imports todos/subtasks/tags
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'File is not valid JSON' }, { status: 400 });
  }

  const validationError = validateExportFormat(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const data = body as {
    tags: { id: number; name: string; color?: string }[];
    todos: {
      title: string;
      description?: string | null;
      completed?: boolean;
      due_date?: string | null;
      priority?: string;
      is_recurring?: boolean;
      recurrence_pattern?: string | null;
      reminder_minutes?: number | null;
      subtasks?: { title: string; completed?: boolean; position?: number }[];
      tag_ids?: number[];
    }[];
  };

  // 1. Remap tags — reuse by name, create if new
  const tagIdMap: Record<number, number> = {};
  for (const exportedTag of data.tags) {
    if (!exportedTag.name?.trim()) continue;
    const existing = tagDB.getByName(session.userId, exportedTag.name);
    if (existing) {
      tagIdMap[exportedTag.id] = existing.id;
    } else {
      try {
        const newTag = tagDB.create(session.userId, {
          name: exportedTag.name,
          color: exportedTag.color ?? '#3B82F6',
        });
        tagIdMap[exportedTag.id] = newTag.id;
      } catch {
        // Tag already exists due to race condition — try to fetch it
        const existing2 = tagDB.getByName(session.userId, exportedTag.name);
        if (existing2) tagIdMap[exportedTag.id] = existing2.id;
      }
    }
  }

  // 2. Create todos, subtasks, and tag associations
  let importedTodoCount = 0;
  for (const exportedTodo of data.todos) {
    if (!exportedTodo.title?.trim()) continue;

    const todo = todoDB.create(session.userId, {
      title:              exportedTodo.title,
      description:        exportedTodo.description ?? undefined,
      due_date:           exportedTodo.due_date ?? undefined,
      priority:           (['high', 'medium', 'low'].includes(exportedTodo.priority ?? '')
                            ? exportedTodo.priority : 'medium') as 'high' | 'medium' | 'low',
      is_recurring:       exportedTodo.is_recurring ?? false,
      recurrence_pattern: exportedTodo.recurrence_pattern
                            ? (exportedTodo.recurrence_pattern as 'daily' | 'weekly' | 'monthly' | 'yearly')
                            : null,
      reminder_minutes:   exportedTodo.reminder_minutes ?? null,
    });

    // Restore completed state
    if (exportedTodo.completed) {
      todoDB.update(session.userId, todo.id, { completed: true });
    }

    // Create subtasks
    const subtasks = [...(exportedTodo.subtasks ?? [])].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );
    for (const sub of subtasks) {
      if (!sub.title?.trim()) continue;
      const s = subtaskDB.create(todo.id, session.userId, { title: sub.title });
      if (s && sub.completed) {
        subtaskDB.update(s.id, todo.id, session.userId, { completed: true });
      }
    }

    // Re-associate tags using remapped IDs
    for (const oldTagId of exportedTodo.tag_ids ?? []) {
      const newTagId = tagIdMap[oldTagId];
      if (newTagId) tagDB.addToTodo(session.userId, todo.id, newTagId);
    }

    importedTodoCount++;
  }

  return NextResponse.json({
    imported: {
      todos: importedTodoCount,
      tags:  Object.keys(tagIdMap).length,
    },
  });
}
