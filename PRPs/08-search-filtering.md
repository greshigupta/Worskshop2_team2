# PRP 08 — Search & Filtering

## Feature Overview
The todo list supports real-time text search (matching title and tag names) and multiple simultaneous filters (priority, tag). All filtering is **client-side** for instant response. Filters combine with AND logic. An active filter summary shows what's applied, with a "Clear All" button.

---

## User Stories
- As a user, I want to search todos by title so I can find a specific item quickly.
- As a user, I want search to also match tag names so I can find todos by category.
- As a user, I want to filter by priority so I can focus on what's most urgent.
- As a user, I want multiple filters to combine so I can narrow the list precisely.
- As a user, I want to clear all filters in one click so I can see everything again.

---

## User Flow

### Text Search
1. User types in the search box at the top of the page
2. List updates in real-time as the user types (no submit)
3. Matching is case-insensitive; matches title OR any tag name
4. If no results, an empty-state message is shown

### Priority Filter
1. User selects from the Priority dropdown (see PRP 02)
2. Only todos with that priority shown
3. Indicator appears: "Priority: High ✕"

### Tag Filter
1. User clicks a tag badge on any todo card (see PRP 06)
2. Only todos with that tag shown
3. Indicator appears: "Tag: Work ✕"

### Combined Filters
- All active filters apply simultaneously (AND logic)
- e.g. search="meeting" + priority=high + tag=Work → must match all three

### Clearing Filters
- Each indicator has an individual ✕ button
- A **"Clear All Filters"** button appears when any filter is active
- Clearing restores the full list

---

## Technical Requirements

### State Variables (`app/page.tsx`)

```typescript
const [searchQuery, setSearchQuery]         = useState('');
const [priorityFilter, setPriorityFilter]   = useState<Priority | 'all'>('all');
const [activeTagFilter, setActiveTagFilter] = useState<Tag | null>(null);
```

### Filtering Logic (client-side, no API call)

```typescript
function applyFilters(todos: Todo[]): Todo[] {
  return todos.filter(todo => {
    // 1. Text search — title OR tag names
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesTitle = todo.title.toLowerCase().includes(q);
      const matchesTag   = todo.tags.some(t => t.name.toLowerCase().includes(q));
      if (!matchesTitle && !matchesTag) return false;
    }

    // 2. Priority filter
    if (priorityFilter !== 'all' && todo.priority !== priorityFilter) return false;

    // 3. Tag filter
    if (activeTagFilter && !todo.tags.some(t => t.id === activeTagFilter.id)) return false;

    return true;
  });
}
```

Apply this function before the section split (Overdue / Active / Completed):
```typescript
const filteredTodos  = applyFilters(todos);
const overdueTodos   = filteredTodos.filter(t => isOverdue(t));
const activeTodos    = filteredTodos.filter(t => !t.completed && !isOverdue(t));
const completedTodos = filteredTodos.filter(t => t.completed);
```

### Debouncing

Use a 300ms debounce on the search input to avoid excessive re-renders when typing fast:

```typescript
import { useState, useEffect } from 'react';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// Usage in app/page.tsx:
const [rawSearch, setRawSearch]   = useState('');
const searchQuery                 = useDebounce(rawSearch, 300);
```

---

## UI Components (`app/page.tsx`)

### Search Input
```tsx
<div className="relative">
  <input
    type="search"
    value={rawSearch}
    onChange={e => setRawSearch(e.target.value)}
    placeholder="Search todos…"
    className="w-full pl-9 pr-4 py-2 border rounded-lg"
    aria-label="Search todos"
  />
  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
  {rawSearch && (
    <button
      className="absolute right-3 top-1/2 -translate-y-1/2"
      onClick={() => setRawSearch('')}
      aria-label="Clear search"
    >✕</button>
  )}
</div>
```

### Active Filters Bar
```tsx
{hasActiveFilters && (
  <div className="flex items-center gap-2 flex-wrap">
    <span className="text-sm text-gray-500">Filters:</span>

    {searchQuery && (
      <span className="filter-chip">
        Search: "{searchQuery}"
        <button onClick={() => setRawSearch('')}>✕</button>
      </span>
    )}

    {priorityFilter !== 'all' && (
      <span className="filter-chip">
        Priority: {priorityFilter}
        <button onClick={() => setPriorityFilter('all')}>✕</button>
      </span>
    )}

    {activeTagFilter && (
      <span className="filter-chip">
        Tag: <TagBadge tag={activeTagFilter} />
        <button onClick={() => setActiveTagFilter(null)}>✕</button>
      </span>
    )}

    <button
      onClick={clearAllFilters}
      className="text-sm text-red-500 hover:underline"
    >
      Clear all
    </button>
  </div>
)}
```

### Empty State
```tsx
{filteredTodos.length === 0 && todos.length > 0 && (
  <div className="text-center py-12 text-gray-400">
    <p className="text-lg">No todos match your filters.</p>
    <button onClick={clearAllFilters} className="mt-2 text-blue-500 hover:underline">
      Clear filters
    </button>
  </div>
)}
```

### Clear All Filters Helper
```typescript
function clearAllFilters() {
  setRawSearch('');
  setPriorityFilter('all');
  setActiveTagFilter(null);
}

const hasActiveFilters = rawSearch !== '' || priorityFilter !== 'all' || activeTagFilter !== null;
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Search term matches tag but not title | Include in results |
| Search term with leading/trailing spaces | Trim before matching |
| No todos at all (empty list) | Show "Create your first todo" empty state, not "no results" |
| All filters active, zero results | Show empty state with "Clear filters" link |
| Tag filter set by click + tag later deleted | Clear `activeTagFilter` when tags are refreshed |
| Long search term | Handled by CSS truncation of filter chip; no length limit on search |

---

## Acceptance Criteria

- [ ] Search input at top of page, visible always
- [ ] Real-time filtering with 300ms debounce
- [ ] Case-insensitive matching
- [ ] Matches both title and tag names
- [ ] Priority filter from dropdown filters list correctly
- [ ] Tag filter from badge click filters list correctly
- [ ] All active filters shown as dismissible chips
- [ ] Individual filter chips have ✕ to clear each filter
- [ ] "Clear all filters" button clears everything
- [ ] Empty state message when no results
- [ ] Filtering 1000+ todos completes in < 100ms

---

## Testing Requirements

### E2E Tests (`tests/09-search-filtering.spec.ts`)
```typescript
test('search by title — matching todos shown')
test('search by title — case insensitive')
test('search by tag name — todos with that tag shown')
test('non-matching search — empty state displayed')
test('clear search with X button')
test('filter by priority high')
test('filter by priority low')
test('click tag badge — tag filter applied')
test('clear tag filter chip')
test('search + priority filter combined — AND logic')
test('search + tag filter combined — AND logic')
test('all three filters combined')
test('clear all filters restores full list')
```

### Unit Tests / Performance
```typescript
test('applyFilters: returns all todos with no active filters')
test('applyFilters: text search matches title')
test('applyFilters: text search matches tag name')
test('applyFilters: priority filter excludes non-matching')
test('applyFilters: tag filter excludes non-matching')
test('applyFilters: combined AND logic — all conditions met')
test('performance: applyFilters on 1000 todos < 100ms')
```

---

## Out of Scope
- Server-side full-text search (SQLite FTS)
- Search history / saved searches
- Searching description/notes field
- Sorting options (covered by priority system)

---

## Success Metrics
- Filter updates visible within one frame (< 16ms) for lists < 200 todos
- 300ms debounce prevents excessive renders
- "No results" message appears immediately — no loading state needed
