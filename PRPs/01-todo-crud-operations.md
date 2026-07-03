# PRP 01 — Todo CRUD Operations

## Feature Overview
The foundational feature of the app. Users can create, read, update, and delete todos. All todos are scoped to the authenticated user. Todos display in three sections: **Overdue**, **Active**, and **Completed**. All date/time operations use **Singapore timezone** (`Asia/Singapore`).

---

## User Stories
- As a user, I want to create a todo with just a title so I can quickly capture tasks.
- As a user, I want to add a due date so I know when something must be done.
- As a user, I want to edit a todo so I can correct mistakes or update details.
- As a user, I want to mark a todo complete so I can track my progress.
- As a user, I want to delete a todo so I can remove irrelevant items.

---

## User Flow

### Create
1. User clicks **"New Todo"** button
2. Modal/form appears with: title (required), due date (optional), notes (optional)
3. User submits → todo appears immediately in Active section (optimistic update)

### Edit
1. User clicks edit icon on a todo
2. Pre-filled form appears
3. User updates fields and saves → UI updates immediately

### Complete
1. User clicks checkbox next to todo
2. Todo moves to Completed section
3. Completed todos show with strikethrough text

### Delete
1. User clicks delete icon on a todo
2. Confirmation dialog: "Delete this todo?" — Yes / Cancel
3. On confirm → todo removed from UI (cascade deletes subtasks + tag associations)

---

## Technical Requirements

### Database Schema (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  description TEXT,
  completed   INTEGER NOT NULL DEFAULT 0,
  due_date    TEXT,                        -- ISO string, Singapore timezone
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
```

> Additional columns (priority, is_recurring, etc.) are added by subsequent PRPs via `ALTER TABLE`.

### TypeScript Interface

```typescript
// lib/db.ts
export interface Todo {
  id: number;
  user_id: number;
  title: string;
  description?: string | null;
  completed: boolean;
  due_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  due_date?: string;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string;
  completed?: boolean;
  due_date?: string | null;
}
```

### Database Methods (`lib/db.ts`)

```typescript
export const todoDB = {
  create(userId: number, input: CreateTodoInput): Todo,
  getAll(userId: number): Todo[],
  getById(userId: number, id: number): Todo | null,
  update(userId: number, id: number, input: UpdateTodoInput): Todo | null,
  delete(userId: number, id: number): boolean,
};
```

All methods use `db.prepare()` prepared statements. No `async/await`.

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/todos` | Create a new todo |
| `GET` | `/api/todos` | Get all todos for current user |
| `GET` | `/api/todos/[id]` | Get single todo |
| `PUT` | `/api/todos/[id]` | Update todo |
| `DELETE` | `/api/todos/[id]` | Delete todo |

#### POST `/api/todos`
**Request body:**
```json
{
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "due_date": "2025-12-01T10:00:00+08:00"
}
```
**Response:** `201` with created todo object  
**Validation errors:** `400` if title is empty/missing; `400` if due_date is in the past (< 1 minute from now)

#### PUT `/api/todos/[id]`
**Request body:** any subset of todo fields  
**Response:** `200` with updated todo; `404` if not found or not owned by user

#### DELETE `/api/todos/[id]`
**Response:** `200 { deleted: true }`; `404` if not found

---

## Validation Rules

| Field | Rule |
|-------|------|
| `title` | Required, non-empty after trim, max 500 chars |
| `due_date` | Optional; if provided, must be at least 1 minute in the future (Singapore time) |
| `description` | Optional, max 2000 chars |

```typescript
// lib/timezone.ts — use these helpers
import { getSingaporeNow } from '@/lib/timezone';

function validateDueDate(due_date: string): boolean {
  const now = getSingaporeNow();
  const due = new Date(due_date);
  return due.getTime() > now.getTime() + 60_000; // at least 1 minute ahead
}
```

---

## UI Components (`app/page.tsx`)

This is a `'use client'` component. All API calls use `fetch()`.

### Todo Sections
```
┌─────────────────────────────────┐
│  🔴 Overdue (N)                 │  ← past due_date, not completed
│    [ ] Fix login bug    [✏️][🗑️] │
├─────────────────────────────────┤
│  📋 Active (N)                  │  ← upcoming or no due date
│    [ ] Write report     [✏️][🗑️] │
│    [ ] Buy groceries    [✏️][🗑️] │
├─────────────────────────────────┤
│  ✅ Completed (N)               │  ← completed = true
│    [✓] Old task         [✏️][🗑️] │
└─────────────────────────────────┘
```

### Sorting Logic
1. Overdue todos: sorted by `due_date` ascending (most overdue first)
2. Active todos: sorted by `due_date` ascending (nulls last), then by `created_at`
3. Completed todos: sorted by `updated_at` descending (most recently completed first)

### Create/Edit Form Fields
- Title (text input, required)
- Description (textarea, optional)
- Due date (datetime-local input, optional)

### Optimistic Updates
- On create: add todo to local state immediately, then confirm with server response
- On toggle complete: update local state immediately, sync with server
- On delete: remove from local state, reverse if API returns error

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Title is whitespace only | Trim and reject with validation error |
| Due date exactly now | Reject — must be at least 1 minute future |
| Delete todo with subtasks | CASCADE delete in DB handles it |
| Edit a completed todo | Allowed — un-complete and edit |
| Network failure on optimistic update | Revert UI state, show error toast |
| User tries to access another user's todo | API returns `404` (not `403`) to avoid enumeration |

---

## Acceptance Criteria

- [ ] Can create a todo with title only
- [ ] Can create a todo with title + due date + description
- [ ] Todo appears immediately after creation (optimistic)
- [ ] Due date must be at least 1 minute in the future
- [ ] Todos sorted: high priority / nearest due date first (within section)
- [ ] Overdue todos display in red/warning section
- [ ] Completed todos show strikethrough and move to Completed section
- [ ] Edit form pre-fills all existing values
- [ ] Delete confirmation dialog shown before removal
- [ ] Delete cascades — subtasks and tag links removed too
- [ ] All times display in Singapore timezone

---

## Testing Requirements

### E2E Tests (`tests/02-todo-crud.spec.ts`)
```typescript
test('create todo with title only')
test('create todo with all fields')
test('edit todo title and description')
test('toggle todo completion — moves to completed section')
test('un-complete a todo — moves back to active section')
test('delete todo — shows confirmation, removes from list')
test('validation — empty title shows error')
test('validation — past due date shows error')
test('overdue todo appears in overdue section')
```

### Unit Tests
```typescript
test('todoDB.create inserts and returns todo')
test('todoDB.getAll returns only current user todos')
test('todoDB.delete returns false for wrong user')
test('validateDueDate rejects past dates')
test('validateDueDate accepts future dates')
```

---

## Out of Scope (handled by other PRPs)
- Priority field → PRP 02
- Recurring fields → PRP 03
- Reminder fields → PRP 04
- Subtasks → PRP 05
- Tags → PRP 06
- Search/filtering → PRP 08
- Export/import → PRP 09

---

## Success Metrics
- Todo operations complete in < 500ms
- Zero data loss on network error (optimistic rollback)
- All E2E tests pass consistently
