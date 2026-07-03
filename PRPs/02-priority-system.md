# PRP 02 — Priority System

## Feature Overview
Todos have a three-level priority: **High**, **Medium**, and **Low**. Priority is shown as a colour-coded badge on every todo. Todos are automatically sorted by priority (High → Medium → Low) within each display section. Users can filter the list to show only a specific priority level.

---

## User Stories
- As a user, I want to mark a todo as High priority so urgent tasks stand out visually.
- As a user, I want todos sorted by priority so I always see the most important items first.
- As a user, I want to filter by priority so I can focus on just High priority work.

---

## User Flow

### Setting Priority
1. In the create or edit form, user sees a **Priority** dropdown: High / Medium (default) / Low
2. Selection is saved with the todo
3. Badge appears on the todo card

### Filtering by Priority
1. User selects a priority from the **Priority Filter** dropdown in the toolbar
2. List immediately updates to show only matching todos
3. A dismissible indicator shows the active filter
4. Clearing the filter restores the full list

---

## Technical Requirements

### Database Change
Add `priority` column to the `todos` table (migration-safe):

```sql
-- In lib/db.ts db.exec() — wrap in try/catch
ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
```

```typescript
// lib/db.ts
export type Priority = 'high' | 'medium' | 'low';
```

Update `Todo` interface:
```typescript
export interface Todo {
  // ... existing fields
  priority: Priority;
}
```

Update `CreateTodoInput` and `UpdateTodoInput`:
```typescript
export interface CreateTodoInput {
  // ... existing fields
  priority?: Priority;   // defaults to 'medium'
}
export interface UpdateTodoInput {
  // ... existing fields
  priority?: Priority;
}
```

### API Changes

**POST `/api/todos`** — accept optional `priority` in body, default to `'medium'`  
**PUT `/api/todos/[id]`** — accept optional `priority` in body  
**GET `/api/todos`** — no change; sorting done client-side

**Validation:**
```typescript
const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];
if (priority && !VALID_PRIORITIES.includes(priority)) {
  return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
}
```

---

## Sorting Logic

Within each section (Overdue / Active / Completed), todos are sorted:
1. **Primary:** priority weight — `high = 0`, `medium = 1`, `low = 2`
2. **Secondary:** `due_date` ascending (nulls last)
3. **Tertiary:** `created_at` ascending

```typescript
const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const pw = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (pw !== 0) return pw;
    if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
```

---

## UI Components (`app/page.tsx`)

### Priority Badge
```tsx
const PRIORITY_STYLES: Record<Priority, string> = {
  high:   'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  low:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}
```

### Priority Dropdown (in forms)
```tsx
<select name="priority" defaultValue="medium">
  <option value="high">🔴 High</option>
  <option value="medium">🟡 Medium</option>
  <option value="low">🔵 Low</option>
</select>
```

### Priority Filter (toolbar)
```tsx
<select
  value={priorityFilter}
  onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
>
  <option value="all">All Priorities</option>
  <option value="high">🔴 High</option>
  <option value="medium">🟡 Medium</option>
  <option value="low">🔵 Low</option>
</select>
```

When a priority filter is active, show an indicator:
```tsx
{priorityFilter !== 'all' && (
  <span className="filter-indicator">
    Priority: {priorityFilter}
    <button onClick={() => setPriorityFilter('all')}>✕</button>
  </span>
)}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Legacy todos without `priority` field | `DEFAULT 'medium'` in schema ensures they get medium |
| Invalid priority value from API | Return `400` with validation error |
| Priority filter + tag filter combined | Both active simultaneously (AND logic — PRP 08) |
| Editing priority of completed todo | Allowed; re-sorts within Completed section |

---

## Accessibility
- Badge colours must meet WCAG AA contrast ratio (4.5:1 for text)
- Priority dropdown labelled with `<label>` element
- Filter dropdown labelled with `aria-label="Filter by priority"`
- Colour is not the only indicator — text label always visible in badge

---

## Acceptance Criteria

- [ ] Three priority levels (High / Medium / Low) available in all forms
- [ ] Default priority is Medium
- [ ] Colour-coded badges display on all todo cards
- [ ] Todos sorted High → Medium → Low within each section
- [ ] Priority filter shows only matching todos
- [ ] Active filter has a visible dismissible indicator
- [ ] Editing priority updates the badge and re-sorts immediately
- [ ] Dark mode badge colours are readable (WCAG AA)

---

## Testing Requirements

### E2E Tests (`tests/03-priority.spec.ts`)
```typescript
test('create todo defaults to medium priority')
test('create todo with high priority — red badge shown')
test('create todo with low priority — blue badge shown')
test('edit priority from medium to high — badge updates')
test('filter by high priority — only high todos shown')
test('filter by low priority — only low todos shown')
test('clear priority filter — all todos restored')
test('todos sorted high before medium before low')
test('priority badges visible in dark mode')
```

### Unit Tests
```typescript
test('sortTodos: high priority before medium')
test('sortTodos: medium priority before low')
test('sortTodos: same priority sorted by due date')
test('API: invalid priority value returns 400')
test('API: missing priority defaults to medium')
```

---

## Out of Scope
- Priority icons/emojis beyond the text badge — add in later polish
- Priority-based notifications — handled by PRP 04

---

## Success Metrics
- Priority badge visible at a glance on all screen sizes
- Sort order correct immediately after create/edit — no flicker
- Filter response time < 100ms (client-side filtering)
