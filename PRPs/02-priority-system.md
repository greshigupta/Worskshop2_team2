# PRP 02: Priority System

## Feature Overview

A three-level priority system that allows users to categorize todos by urgency/importance. Priorities are visually distinguished with color-coded badges and automatically sort todos so the most important tasks appear first. Users can filter the todo list by a specific priority level.

**Tech Stack:**
- Framework: Next.js 16 (App Router)
- Database: SQLite via `better-sqlite3`
- Styling: Tailwind CSS 4
- Testing: Playwright for E2E

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US-01 | User | Assign a priority level when creating a todo | I can distinguish urgent from non-urgent tasks |
| US-02 | User | See color-coded priority badges on todos | I can visually scan priority at a glance |
| US-03 | User | Change a todo's priority via edit | I can reprioritize tasks as they evolve |
| US-04 | User | Filter todos by a single priority level | I can focus on only high-priority items |
| US-05 | User | Have todos auto-sorted by priority | High-priority tasks always appear first |

---

## User Flow

### Setting Priority on Create
1. User enters title in the create form
2. From the **Priority** dropdown, selects: `High`, `Medium` (default), or `Low`
3. Clicks **"Add"** — todo is created with selected priority
4. New todo appears sorted appropriately in the Pending section

### Changing Priority via Edit
1. User clicks **"Edit"** on an existing todo
2. Edit modal opens; priority dropdown shows current value
3. User changes priority selection
4. Clicks **"Update"**
5. Todo re-sorts immediately in the list

### Filtering by Priority
1. User selects a priority from the **Priority Filter** dropdown (located above the todo list)
2. Only todos matching that priority are shown (all sections: Overdue, Pending, Completed)
3. Selecting **"All Priorities"** clears the filter
4. Filter indicator is shown when active

---

## Technical Requirements

### Database Schema

The `priority` column is part of the `todos` table (defined in PRP 01):

```sql
ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'
  CHECK(priority IN ('high', 'medium', 'low'));

CREATE INDEX idx_todos_priority ON todos(priority);
```

No separate table is needed for priorities — they are an enum constraint.

### TypeScript Types

```typescript
// lib/types.ts

export type Priority = 'high' | 'medium' | 'low';

export const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 1,
  medium: 2,
  low: 3,
};
```

### API Changes

Priority is validated in the `POST /api/todos` and `PUT /api/todos/[id]` endpoints:

```typescript
// Validation helper
function validatePriority(value: unknown): Priority {
  if (!value || !['high', 'medium', 'low'].includes(value as string)) {
    throw new Error('Invalid priority. Must be high, medium, or low.');
  }
  return value as Priority;
}

// In POST /api/todos
const priority = (body.priority as Priority) || 'medium';
validatePriority(priority);
```

### Sorting with Priority

```typescript
// Sorting is applied when fetching todos — highest priority first
export function sortTodosByPriority(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pDiff !== 0) return pDiff;
    // Secondary: due date (earliest first, nulls last)
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}
```

---

## UI Components

### PriorityBadge Component

```tsx
// components/PriorityBadge.tsx

interface PriorityBadgeProps {
  priority: Priority;
}

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[priority]}`}
      data-testid={`priority-badge-${priority}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
```

### PrioritySelect Component

Used in both create and edit forms:

```tsx
// components/PrioritySelect.tsx

interface PrioritySelectProps {
  value: Priority;
  onChange: (p: Priority) => void;
  id?: string;
}

export function PrioritySelect({ value, onChange, id = 'priority-select' }: PrioritySelectProps) {
  return (
    <select
      id={id}
      data-testid="priority-select"
      value={value}
      onChange={(e) => onChange(e.target.value as Priority)}
      className="rounded border border-gray-300 px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"
    >
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>
  );
}
```

### PriorityFilter Component

Dropdown shown above the todo list:

```tsx
// components/PriorityFilter.tsx

interface PriorityFilterProps {
  value: Priority | 'all';
  onChange: (p: Priority | 'all') => void;
}

export function PriorityFilter({ value, onChange }: PriorityFilterProps) {
  return (
    <select
      data-testid="priority-filter"
      value={value}
      onChange={(e) => onChange(e.target.value as Priority | 'all')}
      className="rounded border px-2 py-1 text-sm"
    >
      <option value="all">All Priorities</option>
      <option value="high">High Priority</option>
      <option value="medium">Medium Priority</option>
      <option value="low">Low Priority</option>
    </select>
  );
}
```

### Integration in Main Page

```tsx
// app/page.tsx (relevant section)

const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');

const filteredTodos = useMemo(() => {
  let result = todos;
  if (priorityFilter !== 'all') {
    result = result.filter(t => t.priority === priorityFilter);
  }
  return sortTodosByPriority(result);
}, [todos, priorityFilter]);

// Sections derived from filteredTodos
const overdue = filteredTodos.filter(t => !t.completed && t.due_date && isPastDue(t.due_date));
const pending = filteredTodos.filter(t => !t.completed && !(t.due_date && isPastDue(t.due_date)));
const completed = filteredTodos.filter(t => t.completed);
```

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Priority not provided on create | Default to `'medium'` |
| Invalid priority string in API | Return 400: `"Invalid priority"` |
| Priority filter applied, no matching todos | Sections are empty; show "No todos match filter" state |
| Editing priority from high to low | Todo re-sorts to appear lower in the list immediately |
| Dark mode — badge colors | Use dark variants: `dark:bg-red-900`, etc. for contrast |
| Priority badge in Overdue section | Badge still shows; Overdue styling co-exists with priority colors |
| Accessibility — color alone | Badge text always present ("High", "Medium", "Low") alongside color |

---

## Acceptance Criteria

- [ ] Three priority levels: `high`, `medium`, `low`
- [ ] Default priority is `medium` when not specified
- [ ] High: red badge (`bg-red-100 text-red-800`)
- [ ] Medium: yellow badge (`bg-yellow-100 text-yellow-800`)
- [ ] Low: blue badge (`bg-blue-100 text-blue-800`)
- [ ] Dark mode: badge colors adapt for readability
- [ ] Todos auto-sort: high → medium → low within each section
- [ ] Priority filter shows only matching todos across all sections
- [ ] "All Priorities" filter shows all todos
- [ ] Invalid priority value rejected by API with 400 status
- [ ] Priority badge always shows text label (not color alone)
- [ ] WCAG AA contrast ratio met for all badge colors in light and dark mode

---

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/02-priority.spec.ts

test('create todo with high priority', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Urgent task');
  await page.selectOption('[data-testid="priority-select"]', 'high');
  await page.click('[data-testid="add-button"]');
  await expect(page.locator('[data-testid="priority-badge-high"]')).toBeVisible();
});

test('create todo with low priority', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Low priority task');
  await page.selectOption('[data-testid="priority-select"]', 'low');
  await page.click('[data-testid="add-button"]');
  await expect(page.locator('[data-testid="priority-badge-low"]')).toBeVisible();
});

test('default priority is medium', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Default priority task');
  await page.click('[data-testid="add-button"]');
  await expect(page.locator('[data-testid="priority-badge-medium"]')).toBeVisible();
});

test('edit priority from medium to high', async ({ page }) => {
  // Create medium priority todo first
  await page.click('[data-testid="edit-button"]');
  await page.selectOption('[data-testid="edit-priority-select"]', 'high');
  await page.click('[data-testid="update-button"]');
  await expect(page.locator('[data-testid="priority-badge-high"]')).toBeVisible();
});

test('filter by high priority shows only high todos', async ({ page }) => {
  await page.selectOption('[data-testid="priority-filter"]', 'high');
  const badges = page.locator('[data-testid^="priority-badge-"]');
  const count = await badges.count();
  for (let i = 0; i < count; i++) {
    await expect(badges.nth(i)).toHaveAttribute('data-testid', 'priority-badge-high');
  }
});

test('sorting: high priority appears before medium', async ({ page }) => {
  // Create high and medium priority todos
  const items = page.locator('[data-testid="todo-item"]');
  const firstBadge = items.first().locator('[data-testid^="priority-badge-"]');
  await expect(firstBadge).toHaveAttribute('data-testid', 'priority-badge-high');
});
```

### Visual Tests

- Badge colors correct in light mode
- Badge colors correct in dark mode
- Contrast ratio passes WCAG AA (min 4.5:1 for normal text)

---

## Out of Scope

- More than three priority levels
- Custom priority names or colors
- Priority deadlines or automatic escalation
- Priority statistics or analytics
- Bulk priority change

---

## Success Metrics

- Priority badge renders within the same render cycle as the todo item
- Filter operation completes in < 50ms client-side
- Sorting applied consistently across all three sections
- Color contrast passes automated accessibility checks
