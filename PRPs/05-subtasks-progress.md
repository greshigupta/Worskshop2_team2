# PRP 05: Subtasks & Progress Tracking

## Feature Overview

The Subtasks & Progress Tracking feature allows users to break down a todo into smaller, actionable checklist items (subtasks). Each subtask can be individually completed, and a visual progress bar reflects how much of the parent todo is done. Subtasks are ordered via position management and are automatically removed when the parent todo is deleted (cascade delete).

**Key Capabilities:**
- Checklist functionality (add, toggle, edit, delete subtasks)
- Visual progress bars showing completion percentage
- Position management (ordering and reordering subtasks)
- Cascade delete behavior (subtasks removed with parent todo)

---

## User Stories

### US-1: Break Down a Task
**As a** busy user managing complex todos,
**I want to** add subtasks (checklist items) under a todo,
**So that** I can track the individual steps required to complete it.

### US-2: Track Progress Visually
**As a** user working through a multi-step todo,
**I want to** see a progress bar based on completed subtasks,
**So that** I know at a glance how close I am to finishing.

### US-3: Reorder Subtasks
**As a** user planning my work,
**I want to** control the order of my subtasks,
**So that** they reflect the logical sequence of steps.

### US-4: Clean Up Automatically
**As a** user deleting a completed todo,
**I want** its subtasks to be removed automatically,
**So that** no orphaned data remains in the system.

---

## User Flow

1. User opens a todo (expands it or opens the detail view).
2. User adds a subtask by typing a title and pressing Enter or clicking "Add".
3. The subtask appears in the checklist at the next available position.
4. User toggles a subtask checkbox to mark it complete/incomplete.
5. The progress bar updates immediately to reflect the new completion percentage.
6. User can edit a subtask title inline or delete an individual subtask.
7. User can reorder subtasks (drag or move up/down), updating their positions.
8. When the parent todo is deleted, all its subtasks are removed automatically.

---

## Technical Requirements

### Database Schema

Subtasks are stored in a dedicated table with a foreign key to `todos`, using `ON DELETE CASCADE` for automatic cleanup.

```sql
CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);
```

> **Note:** Ensure `PRAGMA foreign_keys = ON;` is enabled in `lib/db.ts` so that `ON DELETE CASCADE` is enforced by `better-sqlite3`.

### TypeScript Types

Add shared types to `lib/db.ts`:

```typescript
export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSubtaskInput {
  todo_id: number;
  title: string;
  position?: number;
}

export interface UpdateSubtaskInput {
  title?: string;
  completed?: boolean;
  position?: number;
}
```

### Database Operations (`lib/db.ts`)

All operations are synchronous (better-sqlite3) and use prepared statements.

```typescript
export const subtaskDB = {
  findByTodoId(todoId: number): Subtask[] {
    const rows = db
      .prepare(
        `SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC, id ASC`
      )
      .all(todoId) as Array<Omit<Subtask, 'completed'> & { completed: number }>;
    return rows.map((r) => ({ ...r, completed: r.completed === 1 }));
  },

  create(input: CreateSubtaskInput): Subtask {
    const now = getSingaporeNow().toISOString();
    // Default to the next position if not provided
    const nextPosition =
      input.position ??
      ((
        db
          .prepare(
            `SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM subtasks WHERE todo_id = ?`
          )
          .get(input.todo_id) as { pos: number }
      ).pos);

    const result = db
      .prepare(
        `INSERT INTO subtasks (todo_id, title, completed, position, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?, ?)`
      )
      .run(input.todo_id, input.title.trim(), nextPosition, now, now);

    return this.findById(Number(result.lastInsertRowid))!;
  },

  findById(id: number): Subtask | null {
    const row = db
      .prepare(`SELECT * FROM subtasks WHERE id = ?`)
      .get(id) as (Omit<Subtask, 'completed'> & { completed: number }) | undefined;
    return row ? { ...row, completed: row.completed === 1 } : null;
  },

  update(id: number, input: UpdateSubtaskInput): Subtask | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = getSingaporeNow().toISOString();
    const title = input.title !== undefined ? input.title.trim() : existing.title;
    const completed =
      input.completed !== undefined ? (input.completed ? 1 : 0) : existing.completed ? 1 : 0;
    const position = input.position !== undefined ? input.position : existing.position;

    db.prepare(
      `UPDATE subtasks SET title = ?, completed = ?, position = ?, updated_at = ? WHERE id = ?`
    ).run(title, completed, position, now, id);

    return this.findById(id);
  },

  delete(id: number): boolean {
    const result = db.prepare(`DELETE FROM subtasks WHERE id = ?`).run(id);
    return result.changes > 0;
  },

  reorder(todoId: number, orderedIds: number[]): void {
    const now = getSingaporeNow().toISOString();
    const stmt = db.prepare(
      `UPDATE subtasks SET position = ?, updated_at = ? WHERE id = ? AND todo_id = ?`
    );
    const tx = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => stmt.run(index, now, id, todoId));
    });
    tx(orderedIds);
  },

  getProgress(todoId: number): { total: number; completed: number; percent: number } {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(completed), 0) AS completed
         FROM subtasks WHERE todo_id = ?`
      )
      .get(todoId) as { total: number; completed: number };
    const percent = row.total === 0 ? 0 : Math.round((row.completed / row.total) * 100);
    return { total: row.total, completed: row.completed, percent };
  },
};
```

### API Endpoints

All routes verify the session first and confirm the parent todo belongs to `session.userId`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/todos/[id]/subtasks` | List all subtasks for a todo |
| `POST` | `/api/todos/[id]/subtasks` | Create a new subtask |
| `PUT` | `/api/todos/[id]/subtasks/[subtaskId]` | Update a subtask (title/completed/position) |
| `DELETE` | `/api/todos/[id]/subtasks/[subtaskId]` | Delete a single subtask |
| `PUT` | `/api/todos/[id]/subtasks/reorder` | Reorder subtasks (accepts ordered ID array) |

**Example: `POST /api/todos/[id]/subtasks`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params; // params is a Promise in Next.js 16
  const todoId = Number(id);

  // Ownership check
  const todo = todoDB.findById(todoId);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const body = await request.json();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const subtask = subtaskDB.create({ todo_id: todoId, title });
  return NextResponse.json({ success: true, data: subtask }, { status: 201 });
}
```

---

## UI Components

The subtask checklist and progress bar live in the main todo component (`app/page.tsx`), consistent with the monolithic UI pattern.

### Progress Bar

```tsx
function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>
          {completed} / {total} subtasks
        </span>
        <span>{percent}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-green-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
```

### Subtask Checklist Item

```tsx
function SubtaskItem({
  subtask,
  onToggle,
  onDelete,
}: {
  subtask: Subtask;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <input
        type="checkbox"
        checked={subtask.completed}
        onChange={(e) => onToggle(subtask.id, e.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
      <span
        className={`flex-1 text-sm ${
          subtask.completed ? 'line-through text-gray-400' : 'text-gray-800'
        }`}
      >
        {subtask.title}
      </span>
      <button
        onClick={() => onDelete(subtask.id)}
        className="text-gray-400 hover:text-red-500 text-xs"
        aria-label="Delete subtask"
      >
        ✕
      </button>
    </div>
  );
}
```

---

## Edge Cases

| Scenario | Expected Handling |
|----------|-------------------|
| Empty subtask title | Reject with 400 error; do not create |
| Whitespace-only title | Trim and reject if empty |
| Todo has zero subtasks | Progress bar shows 0% and is hidden or shows "No subtasks" |
| All subtasks completed | Progress bar shows 100% (green, full) |
| Parent todo deleted | All subtasks deleted via `ON DELETE CASCADE` |
| Subtask does not belong to the todo | Return 404; never update cross-todo |
| Concurrent reorder requests | Use a DB transaction so positions stay consistent |
| Deleting a middle subtask | Remaining subtasks keep positions; gaps are acceptable (order preserved) |
| Very long subtask title | Truncate in UI (CSS), store full text |
| User not authenticated | Return 401 before any DB access |
| Subtask of another user's todo | Ownership check on parent todo blocks access (404) |

---

## Acceptance Criteria

- [ ] Users can add a subtask to a todo with a non-empty title.
- [ ] Users can toggle a subtask between completed and incomplete.
- [ ] Users can edit a subtask's title inline.
- [ ] Users can delete an individual subtask.
- [ ] The progress bar accurately shows completed/total and percentage.
- [ ] Progress updates immediately after any toggle (optimistic UI).
- [ ] Subtasks are displayed in `position` order.
- [ ] Reordering subtasks persists their new positions.
- [ ] Deleting a parent todo removes all its subtasks (cascade).
- [ ] All endpoints require authentication and enforce todo ownership.
- [ ] All timestamps use Singapore timezone via `lib/timezone.ts`.

---

## Testing Requirements

### E2E Tests (Playwright — `tests/05-subtasks-progress.spec.ts`)

- **Add subtask**: Create a todo, add a subtask, verify it appears in the checklist.
- **Toggle completion**: Toggle a subtask and verify the progress bar updates.
- **Progress calculation**: Add 4 subtasks, complete 2, verify progress reads 50%.
- **Edit subtask**: Rename a subtask inline and verify persistence after reload.
- **Delete subtask**: Delete a subtask and verify it is removed and progress recalculates.
- **Reorder**: Reorder subtasks and verify order persists after reload.
- **Cascade delete**: Delete the parent todo, verify subtasks are gone (query API returns empty).
- **Auth guard**: Attempt subtask actions while logged out; expect 401/redirect.

Use the `tests/helpers.ts` helper methods (e.g., `createTodo()`, `addSubtask()`).

### Unit Tests

- `subtaskDB.create` sets the correct next `position`.
- `subtaskDB.getProgress` returns `0%` for zero subtasks and correct percent otherwise.
- `subtaskDB.reorder` updates positions transactionally.
- `subtaskDB.update` toggles `completed` correctly (boolean ↔ integer conversion).
- Cascade delete removes subtasks when the parent todo is deleted.

---

## Out of Scope

- Nested subtasks (sub-subtasks / multi-level hierarchy).
- Assigning subtasks to different users.
- Subtask-level due dates or reminders.
- Subtask-level tags or priorities.
- Drag-and-drop across different parent todos.

---

## Success Metrics

- **Adoption**: % of todos that contain at least one subtask.
- **Completion accuracy**: Progress bar reflects actual subtask state 100% of the time.
- **Data integrity**: Zero orphaned subtasks after parent todo deletion.
- **Performance**: Subtask list and progress render in under 100ms for up to 50 subtasks.
- **Reliability**: Reorder operations never leave inconsistent positions.

---

## Related PRPs

- **[01-todo-crud-operations.md](01-todo-crud-operations.md)** — Parent todo lifecycle.
- **[07-template-system.md](07-template-system.md)** — Templates serialize subtasks as JSON.

---

**Feature**: Subtasks & Progress Tracking
**Dependencies**: Todo CRUD (01)
**Status**: Ready for implementation
