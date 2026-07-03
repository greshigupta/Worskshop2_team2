# PRP 05 — Subtasks & Progress Tracking

## Feature Overview
Each todo can have an unlimited number of subtasks (a checklist). A visual progress bar shows how many subtasks are completed. Subtasks are stored in a separate `subtasks` table with CASCADE delete tied to the parent todo.

---

## User Stories
- As a user, I want to break a large todo into smaller steps so I can track partial progress.
- As a user, I want to see a progress bar on todos with subtasks so I know how far along I am.
- As a user, I want to check off subtasks individually without completing the parent todo.
- As a user, I want subtasks deleted automatically when I delete their parent todo.

---

## User Flow

### Adding Subtasks
1. User expands the subtasks section on a todo card (click "Subtasks ▾")
2. Input field appears: "Add a subtask…" + Add button
3. User types subtask title and clicks Add (or presses Enter)
4. Subtask appears in the list with a checkbox

### Completing Subtasks
1. User clicks a subtask checkbox → it updates immediately
2. Progress bar and count update in real-time
3. Parent todo remains in its current state (subtask completion ≠ parent completion)

### Deleting Subtasks
1. Hover over subtask → trash icon appears
2. Click trash icon → subtask removed immediately (no confirmation needed)

### Viewing Progress
- Progress shown as: `"X/Y completed (Z%)"` below the subtask list
- Visual progress bar: blue while in progress, green at 100%
- Progress bar visible on the collapsed todo card (as a thin bar) if subtasks exist

---

## Technical Requirements

### Database Schema (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS subtasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id     INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);
```

### TypeScript Interface

```typescript
export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface CreateSubtaskInput {
  title: string;
}

export interface UpdateSubtaskInput {
  title?: string;
  completed?: boolean;
}
```

### Database Methods

```typescript
export const subtaskDB = {
  create(todoId: number, userId: number, input: CreateSubtaskInput): Subtask,
  getForTodo(todoId: number, userId: number): Subtask[],
  update(id: number, todoId: number, userId: number, input: UpdateSubtaskInput): Subtask | null,
  delete(id: number, todoId: number, userId: number): boolean,
};
```

> `userId` is passed through to verify the parent todo belongs to the user before operating on subtasks.

**Position assignment:** On create, set `position` = current max position + 1 for that todo. Keep it simple — no drag-and-drop reordering required.

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/todos/[id]/subtasks` | Create a subtask |
| `PUT` | `/api/subtasks/[id]` | Update a subtask (title/completed) |
| `DELETE` | `/api/subtasks/[id]` | Delete a subtask |

> There is no `GET` endpoint for subtasks — they are included in the todo payload when fetching todos.

#### Including Subtasks in GET `/api/todos`

When returning todos, join subtasks:

```typescript
// In todoDB.getAll — augment each todo
const subtasks = subtaskDB.getForTodo(todo.id, userId);
return { ...todo, subtasks };
```

Or do a single joined query. Either approach is fine; consistency is key.

Updated `Todo` interface:
```typescript
export interface Todo {
  // ... existing fields
  subtasks: Subtask[];
}
```

#### POST `/api/todos/[id]/subtasks`
**Request body:** `{ "title": "Research competitors" }`  
**Response:** `201` with created subtask  
**Validation:** title required, non-empty, max 500 chars; verify parent todo belongs to user

#### PUT `/api/subtasks/[id]`
**Request body:** `{ "completed": true }` or `{ "title": "Updated title" }`  
**Response:** `200` with updated subtask  
**Auth check:** verify the parent todo's `user_id` matches session

#### DELETE `/api/subtasks/[id]`
**Response:** `200 { deleted: true }`  
**Auth check:** same as PUT

---

## Progress Calculation

```typescript
function calculateProgress(subtasks: Subtask[]): { completed: number; total: number; percent: number } {
  const total = subtasks.length;
  const completed = subtasks.filter(s => s.completed).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}
```

---

## UI Components (`app/page.tsx`)

### Progress Bar

```tsx
function ProgressBar({ subtasks }: { subtasks: Subtask[] }) {
  if (subtasks.length === 0) return null;
  const { completed, total, percent } = calculateProgress(subtasks);

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{completed}/{total} completed ({percent}%)</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${percent === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
```

### Subtask List

```tsx
function SubtaskList({ todo, onUpdate }: { todo: Todo; onUpdate: () => void }) {
  const [newTitle, setNewTitle] = useState('');

  const addSubtask = async () => {
    if (!newTitle.trim()) return;
    await fetch(`/api/todos/${todo.id}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle('');
    onUpdate();
  };

  return (
    <div>
      <ProgressBar subtasks={todo.subtasks} />
      {todo.subtasks.map(subtask => (
        <div key={subtask.id} className="flex items-center gap-2 group">
          <input
            type="checkbox"
            checked={subtask.completed}
            onChange={() => toggleSubtask(subtask.id, !subtask.completed)}
          />
          <span className={subtask.completed ? 'line-through text-gray-400' : ''}>
            {subtask.title}
          </span>
          <button
            className="opacity-0 group-hover:opacity-100"
            onClick={() => deleteSubtask(subtask.id)}
          >
            🗑️
          </button>
        </div>
      ))}
      <div className="flex gap-2 mt-2">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addSubtask()}
          placeholder="Add a subtask…"
        />
        <button onClick={addSubtask}>Add</button>
      </div>
    </div>
  );
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Delete parent todo | CASCADE in DB removes all subtasks |
| All subtasks completed | Progress bar turns green; parent todo not auto-completed |
| Zero subtasks | Progress bar hidden; no "0/0" label shown |
| Subtask title is whitespace | Trim and reject |
| Add subtask to someone else's todo | API verifies parent todo user_id |
| Very long subtask title | Truncate display with CSS `truncate`; store up to 500 chars |

---

## Acceptance Criteria

- [ ] Can expand/collapse subtasks section on any todo
- [ ] Can add subtasks via input + Enter or Add button
- [ ] Subtask checkbox toggles completion in real-time
- [ ] Delete subtask removes it immediately (no confirmation)
- [ ] Progress bar shows X/Y count and percentage
- [ ] Progress bar is blue while in progress, green at 100%
- [ ] Deleting parent todo removes all its subtasks (CASCADE)
- [ ] Subtasks section hidden / not counted if todo has none

---

## Testing Requirements

### E2E Tests (`tests/06-subtasks.spec.ts`)
```typescript
test('expand subtasks section on a todo')
test('add subtask via Enter key')
test('add subtask via Add button')
test('progress bar shows 0/2 after adding 2 subtasks')
test('toggle subtask completion — progress updates to 1/2')
test('all subtasks done — progress bar turns green')
test('delete subtask — removed from list')
test('delete parent todo — subtasks also gone (cascade)')
test('empty subtask title — shows validation error')
```

### Unit Tests
```typescript
test('calculateProgress: 0/0 returns 0%')
test('calculateProgress: 1/2 returns 50%')
test('calculateProgress: 2/2 returns 100%')
test('subtaskDB.create assigns correct position')
test('subtaskDB.delete rejects wrong user')
```

---

## Out of Scope
- Drag-and-drop subtask reordering — position is append-only
- Nested subtasks (subtasks of subtasks)
- Subtask due dates or assignees

---

## Success Metrics
- Progress bar updates within one render cycle of a subtask toggle
- No orphaned subtask rows in DB after parent todo deleted
