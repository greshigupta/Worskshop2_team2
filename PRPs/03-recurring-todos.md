# PRP 03: Recurring Todos

## Feature Overview

Recurring todos automatically create the next instance of a task when the current one is completed. Supports four recurrence patterns: **daily**, **weekly**, **monthly**, and **yearly**. When a user marks a recurring todo as complete, the system calculates the next due date and creates a new todo with identical metadata.

**Tech Stack:**
- Framework: Next.js 16 (App Router)
- Database: SQLite via `better-sqlite3` (synchronous)
- Timezone: `Asia/Singapore` for all date calculations
- Styling: Tailwind CSS 4
- Testing: Playwright for E2E

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US-01 | User | Create a todo that repeats on a schedule | Recurring tasks are automatically recreated |
| US-02 | User | Choose daily, weekly, monthly, or yearly recurrence | I can set the right schedule for each task |
| US-03 | User | Complete a recurring todo and have the next one auto-created | I don't need to manually recreate repeating tasks |
| US-04 | User | See a visual indicator that a todo is recurring | I can distinguish recurring from one-off tasks |
| US-05 | User | Disable recurrence on an existing recurring todo | I can stop a recurring pattern when it's no longer needed |
| US-06 | User | Have the next instance inherit the same settings | Priority, reminder, and tags carry over automatically |

---

## User Flow

### Creating a Recurring Todo
1. User enters title in the create form
2. **Checks the "Repeat" checkbox** — recurrence pattern dropdown appears
3. Selects recurrence pattern: `Daily`, `Weekly`, `Monthly`, `Yearly`
4. **Sets a due date** (required for recurring todos — dropdown is disabled without one)
5. Clicks **"Add"**
6. Todo created with a 🔄 badge showing the pattern (e.g., "🔄 weekly")

### Completing a Recurring Todo
1. User checks the checkbox on a recurring todo
2. Todo moves to **Completed** section
3. System automatically creates a new todo in **Pending** with:
   - Same title, priority, recurrence settings, reminder
   - Due date calculated based on pattern from current due date
   - Same tags (if any)
4. New todo visible immediately in Pending section

### Disabling Recurrence
1. User clicks **"Edit"** on a recurring todo
2. Unchecks the **"Repeat"** checkbox
3. Clicks **"Update"**
4. Todo now behaves as a one-time todo; next completion will not create a new instance

---

## Technical Requirements

### Database Schema

Additional columns on the `todos` table:

```sql
-- These columns are part of the todos table (see PRP 01)
-- is_recurring INTEGER NOT NULL DEFAULT 0
-- recurrence_pattern TEXT CHECK(recurrence_pattern IN ('daily','weekly','monthly','yearly'))

-- No additional table needed; recurrence is stored on the todo itself
```

Validation rule: if `is_recurring = 1`, then `recurrence_pattern` must be set and `due_date` must not be null.

### TypeScript Types

```typescript
// lib/types.ts (additions)

export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const RECURRENCE_PATTERNS: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];

export const RECURRENCE_LABELS: Record<RecurrencePattern, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};
```

### Due Date Calculation Logic

The next due date is calculated from the **current due date** (not from today), preserving the original schedule:

```typescript
// lib/recurrence.ts

import { addDays, addWeeks, addMonths, addYears } from 'date-fns';
import { parseSingaporeDate, formatSingaporeDate } from './timezone';

/**
 * Calculate the next due date for a recurring todo.
 * @param currentDueDateStr - ISO string of current due date (Singapore local time)
 * @param pattern - Recurrence pattern
 * @returns ISO string of next due date (Singapore local time)
 */
export function calculateNextDueDate(
  currentDueDateStr: string,
  pattern: RecurrencePattern
): string {
  const current = parseSingaporeDate(currentDueDateStr);

  let next: Date;
  switch (pattern) {
    case 'daily':
      next = addDays(current, 1);
      break;
    case 'weekly':
      next = addWeeks(current, 1);
      break;
    case 'monthly':
      next = addMonths(current, 1);
      break;
    case 'yearly':
      next = addYears(current, 1);
      break;
    default:
      throw new Error(`Unknown recurrence pattern: ${pattern}`);
  }

  return formatSingaporeDate(next);
}
```

### API: Toggle Completion (with Recurrence Logic)

When `PUT /api/todos/[id]` is called with `{ completed: true }` and the todo is recurring:

```typescript
// app/api/todos/[id]/route.ts — PUT handler (relevant section)

import { calculateNextDueDate } from '@/lib/recurrence';

// After updating the todo as completed...
if (completed && todo.is_recurring && todo.due_date && todo.recurrence_pattern) {
  const nextDueDate = calculateNextDueDate(todo.due_date, todo.recurrence_pattern);

  // Create the next instance with same metadata
  const stmt = db.prepare(`
    INSERT INTO todos (user_id, title, priority, is_recurring, recurrence_pattern, reminder_minutes, due_date, completed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
  `);
  stmt.run(
    todo.user_id,
    todo.title,
    todo.priority,
    1,  // is_recurring
    todo.recurrence_pattern,
    todo.reminder_minutes,
    nextDueDate
  );

  // Also copy tags to the new todo (via todo_tags table)
  const newTodoId = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
  const tagRows = db.prepare('SELECT tag_id FROM todo_tags WHERE todo_id = ?').all(todo.id) as { tag_id: number }[];
  const insertTag = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
  for (const { tag_id } of tagRows) {
    insertTag.run(newTodoId.id, tag_id);
  }
}
```

### Validation

```typescript
// In POST /api/todos and PUT /api/todos/[id]

if (is_recurring) {
  if (!due_date) {
    return Response.json({ error: 'Recurring todos require a due date' }, { status: 400 });
  }
  if (!recurrence_pattern || !RECURRENCE_PATTERNS.includes(recurrence_pattern)) {
    return Response.json({ error: 'Invalid or missing recurrence pattern' }, { status: 400 });
  }
}
```

---

## UI Components

### RecurrenceToggle Component

```tsx
// components/RecurrenceToggle.tsx

interface RecurrenceToggleProps {
  isRecurring: boolean;
  pattern: RecurrencePattern | null;
  hasDueDate: boolean;
  onToggle: (value: boolean) => void;
  onPatternChange: (pattern: RecurrencePattern) => void;
}

export function RecurrenceToggle({
  isRecurring, pattern, hasDueDate, onToggle, onPatternChange
}: RecurrenceToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          checked={isRecurring}
          disabled={!hasDueDate}
          onChange={(e) => onToggle(e.target.checked)}
          data-testid="recurring-checkbox"
        />
        Repeat
      </label>

      {isRecurring && (
        <select
          value={pattern || 'weekly'}
          onChange={(e) => onPatternChange(e.target.value as RecurrencePattern)}
          data-testid="recurrence-pattern-select"
          className="rounded border px-2 py-1 text-sm"
        >
          {RECURRENCE_PATTERNS.map(p => (
            <option key={p} value={p}>{RECURRENCE_LABELS[p]}</option>
          ))}
        </select>
      )}

      {!hasDueDate && (
        <span className="text-xs text-gray-500">Set a due date to enable recurrence</span>
      )}
    </div>
  );
}
```

### RecurringBadge Component

```tsx
// components/RecurringBadge.tsx

interface RecurringBadgeProps {
  pattern: RecurrencePattern;
}

export function RecurringBadge({ pattern }: RecurringBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                 bg-purple-100 text-purple-800 border border-purple-200
                 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700"
      data-testid="recurring-badge"
    >
      🔄 {pattern}
    </span>
  );
}
```

### Integration in TodoItem

```tsx
// In TodoItem component, alongside PriorityBadge:
{todo.is_recurring && todo.recurrence_pattern && (
  <RecurringBadge pattern={todo.recurrence_pattern} />
)}
```

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Recurring todo checked without due_date | Checkbox disabled; tooltip: "Set a due date to enable" |
| Recurring todo without recurrence_pattern | API returns 400 |
| Complete recurring todo — next due date falls on same day | New todo created with correct next-day/week/month date |
| Monthly: due date is Jan 31 → next is Feb 28/29 | `date-fns addMonths` handles this correctly (last valid day) |
| Yearly: Feb 29 (leap year) recurring yearly | Next year: `addYears` adjusts to Feb 28 in non-leap years |
| Disable recurrence via edit | `is_recurring = false`, pattern cleared; completion no longer creates new todo |
| Complete recurring todo that already has next instance | Should not create duplicates (check not implemented — avoid double-click) |
| Tags on recurring todo | All tags copied to new instance via `todo_tags` |
| Reminder on recurring todo | `reminder_minutes` copied; `last_notification_sent` reset to null on new instance |

---

## Acceptance Criteria

- [ ] "Repeat" checkbox only enabled when a due date is set
- [ ] When "Repeat" is checked, a pattern dropdown appears (default: weekly)
- [ ] Four recurrence patterns available: daily, weekly, monthly, yearly
- [ ] Recurring todos display a purple 🔄 badge with pattern name
- [ ] On completion, a new todo is created with the next calculated due date
- [ ] New todo inherits: title, priority, recurrence settings, reminder_minutes, tags
- [ ] New todo has `completed = false` and fresh `created_at`
- [ ] New todo has `last_notification_sent = null`
- [ ] Can disable recurrence by unchecking "Repeat" in edit form
- [ ] `calculateNextDueDate` handles month-end edge cases correctly
- [ ] Recurring todo requires a `due_date` — API rejects without it
- [ ] API rejects invalid recurrence pattern values

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/03-recurring.spec.ts

test('create daily recurring todo', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Daily standup');
  await page.fill('[data-testid="due-date-input"]', '2099-12-01T09:00');
  await page.check('[data-testid="recurring-checkbox"]');
  await page.selectOption('[data-testid="recurrence-pattern-select"]', 'daily');
  await page.click('[data-testid="add-button"]');
  await expect(page.locator('[data-testid="recurring-badge"]')).toContainText('daily');
});

test('complete recurring todo creates next instance', async ({ page }) => {
  // Create weekly recurring todo with due 2099-12-01T09:00
  await page.click('[data-testid="todo-checkbox"]');
  // Next instance should appear in Pending with due 2099-12-08T09:00
  await expect(page.locator('[data-testid="pending-section"]')).toContainText('Daily standup');
  await expect(page.locator('[data-testid="recurring-badge"]')).toBeVisible();
});

test('next instance inherits priority and reminder', async ({ page }) => {
  // Create high-priority recurring todo with 1h reminder
  await page.click('[data-testid="todo-checkbox"]');
  // New instance should have same priority badge and reminder badge
  await expect(page.locator('[data-testid="priority-badge-high"]')).toBeVisible();
});

test('recurring checkbox disabled without due date', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'No due date todo');
  await expect(page.locator('[data-testid="recurring-checkbox"]')).toBeDisabled();
});

test('disable recurrence on existing todo', async ({ page }) => {
  await page.click('[data-testid="edit-button"]');
  await page.uncheck('[data-testid="edit-recurring-checkbox"]');
  await page.click('[data-testid="update-button"]');
  await expect(page.locator('[data-testid="recurring-badge"]')).not.toBeVisible();
  // Complete it — no new todo should be created
  await page.click('[data-testid="todo-checkbox"]');
  // Pending count should not increase
});
```

### Unit Tests

```typescript
// tests/unit/recurrence.test.ts

test('daily: next due date is +1 day', () => {
  const result = calculateNextDueDate('2025-11-01T09:00', 'daily');
  expect(result).toBe('2025-11-02T09:00');
});

test('weekly: next due date is +7 days', () => {
  const result = calculateNextDueDate('2025-11-01T09:00', 'weekly');
  expect(result).toBe('2025-11-08T09:00');
});

test('monthly: Jan 31 → Feb 28 (non-leap year)', () => {
  const result = calculateNextDueDate('2025-01-31T09:00', 'monthly');
  expect(result).toBe('2025-02-28T09:00');
});

test('yearly: leap year Feb 29 → Feb 28 next year', () => {
  const result = calculateNextDueDate('2024-02-29T09:00', 'yearly');
  expect(result).toBe('2025-02-28T09:00');
});
```

---

## Out of Scope

- Custom recurrence (e.g., "every 3 days", "every 2 weeks")
- Recurrence end date or max occurrences
- Pausing recurrence without disabling
- Retroactive recurrence (catching up on missed instances)
- Day-of-week selection for weekly (e.g., "every Monday")
- "Skip next" functionality

---

## Success Metrics

- New recurring instance created within the same API response time (< 300ms total)
- Date calculations accurate across all timezones on the server
- No duplicate instances created from double-clicks (UX debounce)
- Monthly/yearly edge cases pass automated unit tests
