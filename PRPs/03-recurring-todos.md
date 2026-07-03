# PRP 03 — Recurring Todos

## Feature Overview
Todos can be set to recur on a schedule: **daily**, **weekly**, **monthly**, or **yearly**. When a recurring todo is marked complete, a new instance is automatically created with the next calculated due date. All metadata (priority, tags, reminder, recurrence pattern) is inherited by the new instance.

---

## User Stories
- As a user, I want to create a daily recurring todo so I don't have to recreate it each day.
- As a user, I want completing a recurring todo to automatically create the next one.
- As a user, I want the next instance to inherit the same settings so I don't lose configuration.
- As a user, I want to stop a todo from recurring by unchecking "Repeat".

---

## User Flow

### Creating a Recurring Todo
1. In create/edit form, user checks **"Repeat"** checkbox
2. A dropdown appears: Daily / Weekly / Monthly / Yearly
3. **Due date becomes required** when recurring is enabled
4. User sets due date — this becomes the first due date
5. On save, todo is created with `is_recurring = true`

### Completing a Recurring Todo
1. User checks the completion checkbox
2. Current instance is marked complete and moves to Completed section
3. A **new** todo is instantly created with:
   - Same title, description, priority, tags, reminder, recurrence pattern
   - Next due date calculated from the recurrence pattern
   - `completed = false`
4. New instance appears in Active section

### Disabling Recurrence
1. User edits the todo and unchecks "Repeat"
2. `is_recurring` set to `false`, `recurrence_pattern` set to `null`
3. Completing the todo does NOT create a new instance

---

## Technical Requirements

### Database Changes

```sql
-- Add to todos table (migration-safe ALTER TABLE in try/catch)
ALTER TABLE todos ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0;
ALTER TABLE todos ADD COLUMN recurrence_pattern TEXT;
```

```typescript
// lib/db.ts
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

// Update Todo interface
export interface Todo {
  // ... existing fields
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
}
```

### Due Date Calculation Logic

```typescript
// lib/timezone.ts or lib/recurrence.ts
import { getSingaporeNow } from '@/lib/timezone';

export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern
): string {
  const date = new Date(currentDueDate);

  switch (pattern) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return date.toISOString();
}
```

**Edge case — monthly on 31st:** If next month has fewer days (e.g., Jan 31 → Feb 28/29), JavaScript's `setMonth` handles this automatically by rolling over to March. This is acceptable behaviour; document it in UI if needed.

### API Changes

**POST `/api/todos`** — accept `is_recurring` and `recurrence_pattern`  
**PUT `/api/todos/[id]`** — accept `is_recurring` and `recurrence_pattern`

**Validation:**
```typescript
const VALID_PATTERNS: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];

if (is_recurring) {
  if (!due_date) {
    return NextResponse.json({ error: 'Recurring todos require a due date' }, { status: 400 });
  }
  if (!recurrence_pattern || !VALID_PATTERNS.includes(recurrence_pattern)) {
    return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 });
  }
}
```

### Completion Logic in PUT `/api/todos/[id]`

When `completed` is set to `true` **and** `todo.is_recurring === true`:

```typescript
if (input.completed && todo.is_recurring && todo.recurrence_pattern && todo.due_date) {
  const nextDueDate = calculateNextDueDate(todo.due_date, todo.recurrence_pattern);

  // Fetch current tags for this todo
  const currentTags = tagDB.getForTodo(userId, todo.id);

  // Create the next instance
  const nextTodo = todoDB.create(userId, {
    title: todo.title,
    description: todo.description,
    priority: todo.priority,
    due_date: nextDueDate,
    is_recurring: true,
    recurrence_pattern: todo.recurrence_pattern,
    reminder_minutes: todo.reminder_minutes ?? null,  // inherited from PRP 04
  });

  // Re-associate tags
  for (const tag of currentTags) {
    tagDB.addToTodo(userId, nextTodo.id, tag.id);
  }
}
```

---

## UI Components (`app/page.tsx`)

### Recurrence Toggle in Form
```tsx
<label>
  <input
    type="checkbox"
    checked={isRecurring}
    onChange={(e) => setIsRecurring(e.target.checked)}
  />
  Repeat
</label>

{isRecurring && (
  <select value={recurrencePattern} onChange={(e) => setRecurrencePattern(e.target.value)}>
    <option value="daily">Daily</option>
    <option value="weekly">Weekly</option>
    <option value="monthly">Monthly</option>
    <option value="yearly">Yearly</option>
  </select>
)}

{isRecurring && !dueDate && (
  <p className="text-red-500 text-sm">Due date required for recurring todos</p>
)}
```

### Recurrence Badge on Todo Card
```tsx
{todo.is_recurring && (
  <span className="text-xs text-gray-500">
    🔄 {todo.recurrence_pattern}
  </span>
)}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Recurring todo with no due date | Blocked at validation — due date required |
| Pattern is `monthly` on the 31st | Rolls over correctly via JS Date behaviour |
| User deletes a recurring todo | Only current instance deleted; no auto-creation |
| User disables recurrence on a todo | Completes normally with no next instance |
| Tags not yet implemented | Guard with `if (tagDB)` — tags added in PRP 06 |
| Reminder not yet implemented | Guard with `todo.reminder_minutes ?? null` |

---

## Acceptance Criteria

- [ ] "Repeat" checkbox appears in create and edit forms
- [ ] Recurrence pattern dropdown only shown when "Repeat" is checked
- [ ] Due date marked required when recurring is enabled
- [ ] Invalid pattern values rejected with `400`
- [ ] 🔄 badge with pattern name shows on recurring todo cards
- [ ] Completing a recurring todo creates a new instance immediately
- [ ] New instance appears in Active section with correct next due date
- [ ] New instance inherits: title, description, priority, recurrence pattern
- [ ] Due date calculations correct for all four patterns
- [ ] Can disable recurrence on an existing recurring todo

---

## Testing Requirements

### E2E Tests (`tests/04-recurring.spec.ts`)
```typescript
test('create daily recurring todo — recurrence badge shown')
test('create weekly recurring todo')
test('create monthly recurring todo')
test('create yearly recurring todo')
test('recurring todo requires due date — validation error without it')
test('complete daily recurring todo — new instance appears in active')
test('new instance has due date +1 day from original')
test('new instance inherits title and priority')
test('disable recurrence — completing does not create new instance')
```

### Unit Tests
```typescript
test('calculateNextDueDate daily: adds 1 day')
test('calculateNextDueDate weekly: adds 7 days')
test('calculateNextDueDate monthly: adds 1 month')
test('calculateNextDueDate yearly: adds 1 year')
test('calculateNextDueDate monthly 31st: handles short months')
```

---

## Out of Scope
- Custom recurrence intervals (e.g., every 3 days) — not required
- End date for recurrence — not required
- Editing all future instances — not required (edit current instance only)

---

## Success Metrics
- Next instance appears within the same API response cycle as the completion (< 500ms total)
- Due date calculations correct in Singapore timezone across DST boundaries
