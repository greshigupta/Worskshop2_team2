# PRP 09 — Export & Import

## Feature Overview
Users can export all their todos (including subtasks and tags) to a JSON file, and import from that same format to restore or migrate data. On import, IDs are remapped to avoid conflicts; existing tags are reused by name; relationships are preserved.

---

## User Stories
- As a user, I want to export my todos so I can back them up or move to another account.
- As a user, I want to import a backup so I can restore my todos after data loss.
- As a user, I want import to reuse existing tags instead of creating duplicates.
- As a user, I want a clear success message telling me how many todos and tags were imported.
- As a user, I want a meaningful error message if the import file is invalid.

---

## User Flow

### Export
1. User clicks **"Export"** button in the toolbar
2. Browser immediately downloads a JSON file named `todos-export-YYYY-MM-DD.json`
3. No confirmation required

### Import
1. User clicks **"Import"** button
2. File picker opens (accepts `.json` only)
3. User selects file → app validates and imports
4. Success: toast message — "Imported 12 todos, 3 tags"
5. Todo list refreshes to show imported items
6. Error: toast message — "Import failed: [reason]"

---

## Technical Requirements

### Export JSON Format

```typescript
interface ExportFormat {
  version: '1.0';
  exported_at: string;           // ISO timestamp
  todos: ExportedTodo[];
  tags: ExportedTag[];
}

interface ExportedTodo {
  id: number;                    // original ID (used for relationship mapping)
  title: string;
  description: string | null;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  created_at: string;
  subtasks: ExportedSubtask[];
  tag_ids: number[];             // references ExportedTag.id
}

interface ExportedSubtask {
  title: string;
  completed: boolean;
  position: number;
}

interface ExportedTag {
  id: number;                    // original ID
  name: string;
  color: string;
}
```

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/todos/export` | Returns JSON export |
| `POST` | `/api/todos/import` | Accepts JSON body, imports |

#### GET `/api/todos/export`

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const todos  = todoDB.getAll(session.userId);          // includes subtasks and tags
  const tags   = tagDB.getAll(session.userId);

  const exportData: ExportFormat = {
    version: '1.0',
    exported_at: getSingaporeNow().toISOString(),
    tags: tags.map(t => ({ id: t.id, name: t.name, color: t.color })),
    todos: todos.map(todo => ({
      id:                 todo.id,
      title:              todo.title,
      description:        todo.description ?? null,
      completed:          todo.completed,
      due_date:           todo.due_date ?? null,
      priority:           todo.priority,
      is_recurring:       todo.is_recurring,
      recurrence_pattern: todo.recurrence_pattern ?? null,
      reminder_minutes:   todo.reminder_minutes ?? null,
      created_at:         todo.created_at,
      subtasks:           todo.subtasks.map(s => ({
                            title:     s.title,
                            completed: s.completed,
                            position:  s.position,
                          })),
      tag_ids:            todo.tags.map(t => t.id),
    })),
  };

  return NextResponse.json(exportData);
}
```

**Client-side download trigger:**
```typescript
const response = await fetch('/api/todos/export');
const data = await response.json();
const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
const url  = URL.createObjectURL(blob);
const a    = document.createElement('a');
a.href     = url;
a.download = `todos-export-${new Date().toISOString().slice(0, 10)}.json`;
a.click();
URL.revokeObjectURL(url);
```

#### POST `/api/todos/import`

**Request body:** the full `ExportFormat` JSON  
**Response:** `200 { imported: { todos: number, tags: number } }` on success  
**Validation errors:** `400` with a descriptive message

```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();

  // 1. Validate format
  if (!body || body.version !== '1.0' || !Array.isArray(body.todos) || !Array.isArray(body.tags)) {
    return NextResponse.json({ error: 'Invalid export format' }, { status: 400 });
  }

  // 2. Remap tags — reuse by name, create if new
  const tagIdMap: Record<number, number> = {};   // old ID → new ID
  for (const exportedTag of body.tags) {
    if (!exportedTag.name?.trim()) continue;
    const existing = tagDB.getByName(session.userId, exportedTag.name);
    if (existing) {
      tagIdMap[exportedTag.id] = existing.id;
    } else {
      const newTag = tagDB.create(session.userId, {
        name:  exportedTag.name,
        color: exportedTag.color ?? '#3B82F6',
      });
      tagIdMap[exportedTag.id] = newTag.id;
    }
  }

  // 3. Create todos and subtasks
  let importedTodoCount = 0;
  for (const exportedTodo of body.todos) {
    if (!exportedTodo.title?.trim()) continue;

    const todo = todoDB.create(session.userId, {
      title:              exportedTodo.title,
      description:        exportedTodo.description,
      due_date:           exportedTodo.due_date,
      priority:           exportedTodo.priority ?? 'medium',
      is_recurring:       exportedTodo.is_recurring ?? false,
      recurrence_pattern: exportedTodo.recurrence_pattern,
      reminder_minutes:   exportedTodo.reminder_minutes,
    });

    // Restore completed state separately
    if (exportedTodo.completed) {
      todoDB.update(session.userId, todo.id, { completed: true });
    }

    // Create subtasks
    for (const sub of exportedTodo.subtasks ?? []) {
      if (sub.title?.trim()) {
        const s = subtaskDB.create(todo.id, session.userId, { title: sub.title });
        if (sub.completed) {
          subtaskDB.update(s.id, todo.id, session.userId, { completed: true });
        }
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
```

### Input Validation

```typescript
function validateExportFormat(data: unknown): string | null {
  if (!data || typeof data !== 'object') return 'File is not valid JSON';
  const d = data as Record<string, unknown>;
  if (d.version !== '1.0') return `Unsupported version: ${d.version}`;
  if (!Array.isArray(d.todos)) return 'Missing todos array';
  if (!Array.isArray(d.tags))  return 'Missing tags array';
  return null; // valid
}
```

---

## UI Components (`app/page.tsx`)

### Export Button
```tsx
<button onClick={handleExport} disabled={isExporting}>
  {isExporting ? 'Exporting…' : '⬇️ Export'}
</button>
```

### Import Button
```tsx
<label>
  <span className="btn">⬆️ Import</span>
  <input
    type="file"
    accept=".json"
    className="hidden"
    onChange={handleImport}
  />
</label>
```

### Import Handler
```typescript
async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    showToast('Import failed: file is not valid JSON', 'error');
    return;
  }

  const error = validateExportFormat(data);
  if (error) {
    showToast(`Import failed: ${error}`, 'error');
    return;
  }

  const res = await fetch('/api/todos/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: text,
  });
  const result = await res.json();

  if (!res.ok) {
    showToast(`Import failed: ${result.error}`, 'error');
    return;
  }

  showToast(`Imported ${result.imported.todos} todos and ${result.imported.tags} tags`, 'success');
  await fetchTodos();   // refresh list
  e.target.value = ''; // reset file input
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Import file with invalid JSON | Client validates before sending — shows error toast |
| Import file with wrong version | `400` error returned |
| Tag with same name already exists | Reuse existing tag — no duplicate created |
| Todo with no title | Skip silently; count is accurate |
| Due date in the past on import | Allowed — imported as-is (user aware it's a restore) |
| Very large import (1000+ todos) | No pagination required; single request acceptable |
| Re-importing the same export | Creates duplicate todos (by design — no de-duplication) |
| Import from different user's export | Works — IDs are remapped, new records created |

---

## Acceptance Criteria

- [ ] Export downloads a `.json` file immediately on click
- [ ] Export filename includes today's date
- [ ] Exported JSON contains todos, subtasks, tags, and relationships
- [ ] Import accepts only `.json` files
- [ ] Import validates format — shows error for invalid files
- [ ] Import success shows count of imported todos and tags
- [ ] Imported todos appear immediately in the list
- [ ] Existing tags reused by name — no duplicates created
- [ ] All subtasks and relationships preserved on import

---

## Testing Requirements

### E2E Tests (`tests/10-export-import.spec.ts`)
```typescript
test('export downloads JSON file')
test('exported file contains all todos')
test('exported file contains tags and associations')
test('import valid file — success toast with count')
test('import valid file — todos appear in list')
test('import valid file — subtasks appear on todos')
test('import reuses existing tag by name')
test('import invalid JSON — error toast')
test('import wrong version — error toast')
test('import empty todos array — zero count message')
```

### Unit Tests
```typescript
test('validateExportFormat: valid format returns null')
test('validateExportFormat: missing todos returns error string')
test('validateExportFormat: wrong version returns error string')
test('tagIdMap: existing tag reused, not duplicated')
test('tagIdMap: new tag created when name not found')
```

---

## Out of Scope
- CSV export
- Selective export (choose which todos to include)
- Import de-duplication (prevent duplicate todos)
- Export / import of templates

---

## Success Metrics
- Export of 100 todos completes in < 500ms
- Import of 100 todos with subtasks and tags completes in < 2 seconds
- Zero orphaned records after import
