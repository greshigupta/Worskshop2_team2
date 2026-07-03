# PRP 07 — Template System

## Feature Overview
Users can save any existing todo as a **template** — capturing its title, description, priority, recurring pattern, reminder offset, and subtasks. Templates can be applied to create a new todo with all those settings pre-filled. Due date is calculated from an offset stored in the template. Templates are organised by optional categories.

---

## User Stories
- As a user, I want to save a complex todo as a template so I can reuse its setup.
- As a user, I want to create a todo from a template so I don't re-enter the same details.
- As a user, I want templates to include subtasks so the checklist comes pre-populated.
- As a user, I want templates organised by category so I can find them quickly.
- As a user, I want to edit or delete templates I no longer need.

---

## User Flow

### Saving a Todo as Template
1. User clicks **"Save as Template"** on an existing todo card
2. Modal appears with fields: Template Name (pre-filled with todo title), Description, Category (text input, optional)
3. User confirms → template saved with a snapshot of the todo's current state

### Creating a Todo from Template
1. User clicks **"Use Template"** button in the toolbar
2. Modal shows list of templates, filterable by category
3. User clicks a template → sees a preview (title, priority, subtasks count, recurrence)
4. User clicks **"Create from Template"** → new todo created, user can optionally review before saving

### Managing Templates
- Edit template: update name, description, category
- Delete template: confirmation dialog

---

## Technical Requirements

### Database Schema (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS templates (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT    NOT NULL,
  description      TEXT,
  category         TEXT,
  title            TEXT    NOT NULL,
  notes            TEXT,
  priority         TEXT    NOT NULL DEFAULT 'medium',
  is_recurring     INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER,
  due_date_offset_days INTEGER,        -- days from today when creating from template
  subtasks_json    TEXT,               -- JSON: [{ title: string, position: number }]
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
```

### TypeScript Interfaces

```typescript
export interface Template {
  id: number;
  user_id: number;
  name: string;
  description?: string | null;
  category?: string | null;
  title: string;
  notes?: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  due_date_offset_days: number | null;
  subtasks_json: string | null;         // raw JSON string
  created_at: string;
  updated_at: string;
}

export interface TemplateSubtask {
  title: string;
  position: number;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  category?: string;
  title: string;
  notes?: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  due_date_offset_days?: number | null;
  subtasks: TemplateSubtask[];
}
```

### Database Methods

```typescript
export const templateDB = {
  create(userId: number, input: CreateTemplateInput): Template,
  getAll(userId: number): Template[],
  getById(userId: number, id: number): Template | null,
  update(userId: number, id: number, input: Partial<CreateTemplateInput>): Template | null,
  delete(userId: number, id: number): boolean,
};
```

**Serialising subtasks:**
```typescript
// On create/update — convert array to JSON string
const subtasksJson = JSON.stringify(input.subtasks ?? []);

// On read — parse back to array
const subtasks: TemplateSubtask[] = JSON.parse(template.subtasks_json ?? '[]');
```

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/templates` | Get all templates for current user |
| `POST` | `/api/templates` | Create a template |
| `PUT` | `/api/templates/[id]` | Update template |
| `DELETE` | `/api/templates/[id]` | Delete template |
| `POST` | `/api/templates/[id]/use` | Create a todo from this template |

#### POST `/api/templates`
**Request body:** `CreateTemplateInput` with `subtasks` array  
**Response:** `201` with created template  
**Validation:** `name` and `title` required

#### POST `/api/templates/[id]/use`
Creates a new todo from the template:

```typescript
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.getById(session.userId, Number(id));
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Calculate due date from offset
  let due_date: string | undefined;
  if (template.due_date_offset_days != null) {
    const date = getSingaporeNow();
    date.setDate(date.getDate() + template.due_date_offset_days);
    due_date = date.toISOString();
  }

  const todo = todoDB.create(session.userId, {
    title: template.title,
    description: template.notes,
    priority: template.priority,
    due_date,
    is_recurring: template.is_recurring,
    recurrence_pattern: template.recurrence_pattern,
    reminder_minutes: template.reminder_minutes,
  });

  // Re-create subtasks
  const subtasks: TemplateSubtask[] = JSON.parse(template.subtasks_json ?? '[]');
  for (const s of subtasks) {
    subtaskDB.create(todo.id, session.userId, { title: s.title });
  }

  return NextResponse.json(todo, { status: 201 });
}
```

---

## "Save as Template" Flow

When the user clicks "Save as Template" on an existing todo:

```typescript
// Collect current todo state
const subtasks: TemplateSubtask[] = todo.subtasks.map((s, i) => ({
  title: s.title,
  position: i,
}));

// Calculate offset days from today if todo has a due date
let due_date_offset_days: number | null = null;
if (todo.due_date) {
  const msPerDay = 86_400_000;
  const diff = new Date(todo.due_date).getTime() - getSingaporeNow().getTime();
  due_date_offset_days = Math.max(0, Math.round(diff / msPerDay));
}

await fetch('/api/templates', {
  method: 'POST',
  body: JSON.stringify({
    name: templateName,         // from user input in modal
    description: templateDesc,
    category: templateCategory,
    title: todo.title,
    notes: todo.description,
    priority: todo.priority,
    is_recurring: todo.is_recurring,
    recurrence_pattern: todo.recurrence_pattern,
    reminder_minutes: todo.reminder_minutes,
    due_date_offset_days,
    subtasks,
  }),
});
```

---

## UI Components (`app/page.tsx`)

### "Save as Template" Modal

Fields:
- Template Name (pre-filled with todo title)
- Template Description (optional)
- Category (text input with datalist for existing categories)

### "Use Template" Modal

```
┌────────────────────────────────────────┐
│  Use Template                     [✕]  │
├────────────────────────────────────────┤
│  Filter: [All Categories ▾]            │
├────────────────────────────────────────┤
│  📋 Weekly Report        [Work]        │
│     Priority: High | 🔄 Weekly         │
│     3 subtasks | 🔔 1 day before       │
│                     [Create from this] │
│                                        │
│  📋 Grocery Run          [Personal]    │
│     Priority: Medium | No recurrence   │
│     5 subtasks                         │
│                     [Create from this] │
└────────────────────────────────────────┘
```

### Category Filter in Template Modal

```tsx
const categories = [...new Set(templates.map(t => t.category).filter(Boolean))];

<select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
  <option value="">All Categories</option>
  {categories.map(cat => (
    <option key={cat} value={cat}>{cat}</option>
  ))}
</select>
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Template used when due_date_offset_days is null | Due date omitted from created todo |
| Template subtasks_json is empty or null | Parse as `[]` — todo created with no subtasks |
| Template deleted — todos created from it | No effect; todos are independent |
| Due date offset puts due date in the past | Still create todo; user can edit (negative offset = today) |
| Template with recurring but no offset | Recurring set; due date empty; user must set it |

---

## Acceptance Criteria

- [ ] "Save as Template" button on every todo card
- [ ] Save modal pre-fills name from todo title
- [ ] Template stores title, priority, recurrence, reminder, subtasks
- [ ] Subtasks serialised to JSON correctly
- [ ] "Use Template" modal lists all templates
- [ ] Category filter works in template modal
- [ ] Template preview shows: priority, recurrence, subtask count, reminder
- [ ] "Create from Template" creates a new todo with correct settings
- [ ] Subtasks from template are created on the new todo
- [ ] Due date calculated from offset
- [ ] Can edit template name, description, category
- [ ] Can delete template (confirmation dialog)

---

## Testing Requirements

### E2E Tests (`tests/08-templates.spec.ts`)
```typescript
test('save todo as template — template appears in list')
test('template inherits priority from todo')
test('template inherits subtasks from todo')
test('create todo from template — title, priority match')
test('create todo from template — subtasks created')
test('create todo from template — due date offset applied')
test('filter templates by category')
test('edit template name')
test('delete template — gone from list')
```

### Unit Tests
```typescript
test('subtasks JSON serialisation round-trip')
test('due_date_offset_days calculation from future due date')
test('due_date_offset_days = 0 for past due date')
test('templateDB.create stores subtasks as JSON string')
test('POST /api/templates/[id]/use creates subtasks')
```

---

## Out of Scope
- Template sharing between users
- Versioning of templates
- Template tags (tags are user-specific and cannot be captured in templates portably)

---

## Success Metrics
- Creating a todo from template takes < 500ms including subtask creation
- Templates modal opens in < 200ms
