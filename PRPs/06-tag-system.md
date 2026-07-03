# PRP 06 — Tag System

## Feature Overview
Users can create colour-coded tags and assign multiple tags to any todo. Tags have a many-to-many relationship with todos. Clicking a tag badge on a todo filters the list to show only todos with that tag. Tags are managed (create / edit / delete) through a dedicated "Manage Tags" modal.

---

## User Stories
- As a user, I want to create custom tags with colours so I can categorise todos visually.
- As a user, I want to assign multiple tags to a todo so I can cross-reference categories.
- As a user, I want to click a tag to filter todos so I can focus on one category.
- As a user, I want to edit a tag's name or colour so corrections propagate everywhere it's used.
- As a user, I want deleting a tag to remove it from all todos automatically.

---

## User Flow

### Managing Tags
1. User clicks **"Manage Tags"** button in the toolbar
2. Modal shows existing tags with edit ✏️ and delete 🗑️ buttons
3. "Create Tag" form at the top: name input + colour picker
4. User creates/edits/deletes tags and closes the modal

### Assigning Tags to a Todo
1. In create/edit form, a "Tags" section shows all available tags as checkboxes
2. User selects one or more tags
3. On save, tag associations updated via API

### Filtering by Tag
1. User clicks a tag badge on any todo card
2. List immediately filters to show only todos with that tag
3. A dismissible indicator shows the active tag filter
4. User can click the indicator's ✕ to clear the filter

---

## Technical Requirements

### Database Schema (`lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL DEFAULT '#3B82F6',  -- Tailwind blue-500 hex
  created_at TEXT    NOT NULL,
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_tags_todo_id ON todo_tags(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_id  ON todo_tags(tag_id);
```

### TypeScript Interfaces

```typescript
export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}
```

Update `Todo` interface to include tags:
```typescript
export interface Todo {
  // ... existing fields
  tags: Tag[];
}
```

### Database Methods

```typescript
export const tagDB = {
  create(userId: number, input: CreateTagInput): Tag,
  getAll(userId: number): Tag[],
  getById(userId: number, id: number): Tag | null,
  update(userId: number, id: number, input: UpdateTagInput): Tag | null,
  delete(userId: number, id: number): boolean,
  getForTodo(userId: number, todoId: number): Tag[],
  addToTodo(userId: number, todoId: number, tagId: number): void,
  removeFromTodo(userId: number, todoId: number, tagId: number): void,
  setForTodo(userId: number, todoId: number, tagIds: number[]): void,  // replaces all associations
};
```

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/tags` | Get all tags for current user |
| `POST` | `/api/tags` | Create a tag |
| `PUT` | `/api/tags/[id]` | Update tag name or colour |
| `DELETE` | `/api/tags/[id]` | Delete tag (removes from all todos) |
| `POST` | `/api/todos/[id]/tags` | Add tag(s) to a todo |
| `DELETE` | `/api/todos/[id]/tags` | Remove tag(s) from a todo |

#### POST `/api/tags`
**Request body:** `{ "name": "Work", "color": "#EF4444" }`  
**Response:** `201` with created tag  
**Validation:** name required; max 50 chars; unique per user (return `409` on duplicate)

#### PUT `/api/tags/[id]`
**Request body:** `{ "name": "Personal", "color": "#10B981" }`  
**Response:** `200` with updated tag  

#### DELETE `/api/tags/[id]`
**Response:** `200 { deleted: true }`  
Cascade in `todo_tags` table handles removal from todos automatically.

#### POST `/api/todos/[id]/tags`
**Request body:** `{ "tagIds": [1, 3, 5] }` — replaces all tag associations  
**Response:** `200 { tags: Tag[] }` — updated tag list for the todo

#### DELETE `/api/todos/[id]/tags`
**Request body:** `{ "tagId": 3 }` — removes single tag  
**Response:** `200 { tags: Tag[] }`

### Including Tags in GET `/api/todos`

When building the todo response, include tags for each todo:
```typescript
const tags = tagDB.getForTodo(userId, todo.id);
return { ...todo, tags };
```

---

## UI Components (`app/page.tsx`)

### Tag Badge (on todo card)
```tsx
function TagBadge({ tag, onClick }: { tag: Tag; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: tag.color }}
      title={`Filter by: ${tag.name}`}
    >
      {tag.name}
    </button>
  );
}
```

### Tag Selector (in create/edit form)
```tsx
<div>
  <label>Tags</label>
  <div className="flex flex-wrap gap-2">
    {allTags.map(tag => (
      <label key={tag.id} className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={selectedTagIds.includes(tag.id)}
          onChange={() => toggleTag(tag.id)}
        />
        <TagBadge tag={tag} />
      </label>
    ))}
  </div>
  {allTags.length === 0 && (
    <p className="text-sm text-gray-400">No tags yet. Create some in "Manage Tags".</p>
  )}
</div>
```

### Manage Tags Modal
```
┌─────────────────────────────────────┐
│  Manage Tags                    [✕] │
├─────────────────────────────────────┤
│  Name: [___________] Color: [🎨]    │
│                        [Create Tag] │
├─────────────────────────────────────┤
│  ● Work      #EF4444   [✏️] [🗑️]    │
│  ● Personal  #10B981   [✏️] [🗑️]    │
│  ● Urgent    #F59E0B   [✏️] [🗑️]    │
└─────────────────────────────────────┘
```

### Active Tag Filter Indicator (toolbar)
```tsx
{activeTagFilter && (
  <span className="filter-indicator" style={{ borderColor: activeTagFilter.color }}>
    Tag: <TagBadge tag={activeTagFilter} />
    <button onClick={() => setActiveTagFilter(null)}>✕</button>
  </span>
)}
```

---

## Colour Picker
Use a standard HTML `<input type="color">`. Default colour: `#3B82F6` (blue-500).

Suggest a set of preset colours for quick selection:
```typescript
const PRESET_COLORS = [
  '#EF4444', // red
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#6B7280', // gray
];
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Duplicate tag name for same user | `409 Conflict` with message "Tag name already exists" |
| Delete a tag used by todos | CASCADE in `todo_tags` removes associations; todos remain |
| Edit tag name/colour | All badge instances update on next render (data re-fetched) |
| Tag filter + priority filter active | Both apply simultaneously (AND logic — PRP 08) |
| Assign tag from another user | API validates `tag.user_id === session.userId` |
| Tag name with special characters | Allowed; sanitise for display |

---

## Acceptance Criteria

- [ ] Can create a tag with name and colour
- [ ] Tag names unique per user (duplicate shows error)
- [ ] Colour picker works — custom and preset colours
- [ ] Tags show as colour badges on todo cards
- [ ] Can assign multiple tags to one todo
- [ ] Editing a tag name/colour propagates to all todo cards
- [ ] Deleting a tag removes it from all todos (CASCADE)
- [ ] Click tag badge on card → filters list to that tag
- [ ] Active tag filter shows dismissible indicator
- [ ] Tag filter clears on click of ✕

---

## Testing Requirements

### E2E Tests (`tests/07-tags.spec.ts`)
```typescript
test('open Manage Tags modal')
test('create tag with name and color')
test('duplicate tag name shows 409 error')
test('edit tag name — badge updates on todo')
test('edit tag color — badge color updates')
test('delete tag — removed from all todos')
test('assign two tags to a todo — both badges shown')
test('click tag badge — filters list to that tag only')
test('clear tag filter — all todos restored')
test('tag filter + priority filter combined')
```

### Unit Tests
```typescript
test('tagDB.create enforces unique name per user')
test('tagDB.delete cascades via todo_tags')
test('tagDB.setForTodo replaces all associations')
test('tagDB.getForTodo returns correct tags')
test('API: tag from different user returns 404')
```

---

## Out of Scope
- Tag hierarchy or nesting
- Tag usage statistics / analytics
- Shared tags across users

---

## Success Metrics
- Tag badge click and filter applied in < 100ms
- Editing a tag name reflects on all todo cards within one render cycle
