# Todo App — Product Requirement Prompts (PRPs) Index

This directory contains 11 feature PRPs for building the Todo App using GitHub Copilot or any AI coding assistant. Each PRP is a self-contained implementation guide for one feature.

---

## 🏗️ Technical Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Frontend | React 19 + Tailwind CSS 4 |
| Database | SQLite via `better-sqlite3` |
| Auth | WebAuthn/Passkeys (`@simplewebauthn`) |
| Timezone | Asia/Singapore throughout |
| Testing | Playwright (E2E) |

---

## 📋 Feature PRP Index

| # | File | Feature | Phase |
|---|------|---------|-------|
| 01 | [01-todo-crud-operations.md](01-todo-crud-operations.md) | Todo CRUD Operations | Foundation |
| 02 | [02-priority-system.md](02-priority-system.md) | Priority System | Foundation |
| 03 | [03-recurring-todos.md](03-recurring-todos.md) | Recurring Todos | Core |
| 04 | [04-reminders-notifications.md](04-reminders-notifications.md) | Reminders & Notifications | Core |
| 05 | [05-subtasks-progress.md](05-subtasks-progress.md) | Subtasks & Progress Tracking | Core |
| 06 | [06-tag-system.md](06-tag-system.md) | Tag System | Organisation |
| 07 | [07-template-system.md](07-template-system.md) | Template System | Productivity |
| 08 | [08-search-filtering.md](08-search-filtering.md) | Search & Filtering | Organisation |
| 09 | [09-export-import.md](09-export-import.md) | Export & Import | Productivity |
| 10 | [10-calendar-view.md](10-calendar-view.md) | Calendar View | Productivity |
| 11 | [11-authentication-webauthn.md](11-authentication-webauthn.md) | WebAuthn Authentication | Infrastructure |

---

## 🚀 Recommended Implementation Order

### Phase 1 — Foundation (start here)
1. **Feature 11 — Authentication**: Implement first so all other features have session context
2. **Feature 01 — Todo CRUD**: Core data model everything else builds on
3. **Feature 02 — Priority System**: Extends the base Todo model

### Phase 2 — Core Features
4. **Feature 03 — Recurring Todos**: Requires todo CRUD + due dates
5. **Feature 04 — Reminders & Notifications**: Requires todo CRUD + due dates
6. **Feature 05 — Subtasks & Progress**: Requires todo CRUD

### Phase 3 — Organisation
7. **Feature 06 — Tag System**: Requires todo CRUD
8. **Feature 08 — Search & Filtering**: Requires todos + tags

### Phase 4 — Productivity
9. **Feature 07 — Template System**: Requires subtasks
10. **Feature 09 — Export & Import**: Requires all data models
11. **Feature 10 — Calendar View**: Requires todos + holidays seed

---

## 🔗 Feature Dependency Graph

```
Authentication (11)
    └── All features require session

Todo CRUD (01)
    ├── Priority (02)
    ├── Recurring (03)
    ├── Reminders (04)
    ├── Subtasks (05) ──── Templates (07)
    ├── Tags (06) ──────── Search/Filtering (08)
    ├── Export/Import (09)
    └── Calendar (10)
```

---

## 📁 Required Project File Structure

```
todo-app/
├── app/
│   ├── page.tsx                          # Main UI (~2200 lines, 'use client')
│   ├── calendar/
│   │   └── page.tsx                      # Calendar view
│   ├── login/
│   │   └── page.tsx                      # Login / register page
│   └── api/
│       ├── auth/
│       │   ├── register-options/route.ts
│       │   ├── register-verify/route.ts
│       │   ├── login-options/route.ts
│       │   ├── login-verify/route.ts
│       │   ├── logout/route.ts
│       │   └── me/route.ts
│       ├── todos/
│       │   ├── route.ts                  # GET all, POST create
│       │   ├── export/route.ts
│       │   ├── import/route.ts
│       │   └── [id]/
│       │       ├── route.ts              # GET, PUT, DELETE
│       │       ├── subtasks/route.ts
│       │       └── tags/route.ts
│       ├── subtasks/[id]/route.ts
│       ├── tags/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── templates/
│       │   ├── route.ts
│       │   └── [id]/
│       │       ├── route.ts
│       │       └── use/route.ts
│       ├── notifications/check/route.ts
│       └── holidays/route.ts
├── lib/
│   ├── db.ts                             # All DB interfaces + CRUD (~700 lines)
│   ├── auth.ts                           # JWT session helpers
│   ├── timezone.ts                       # Singapore timezone utilities
│   └── hooks/
│       └── useNotifications.ts
├── middleware.ts                         # Route protection
├── scripts/
│   └── seed-holidays.ts
├── tests/
│   ├── helpers.ts
│   ├── 01-authentication.spec.ts
│   ├── 02-todo-crud.spec.ts
│   ├── 03-priority.spec.ts
│   ├── 04-recurring.spec.ts
│   ├── 05-reminders.spec.ts
│   ├── 06-subtasks.spec.ts
│   ├── 07-tags.spec.ts
│   ├── 08-templates.spec.ts
│   ├── 09-search-filtering.spec.ts
│   ├── 10-export-import.spec.ts
│   └── 11-calendar.spec.ts
├── todos.db                              # SQLite database (auto-created)
├── playwright.config.ts
└── .github/
    └── copilot-instructions.md
```

---

## ⚡ Critical Patterns (apply to ALL features)

### 1. Always use Singapore timezone
```typescript
import { getSingaporeNow, formatSingaporeDate } from '@/lib/timezone';
const now = getSingaporeNow(); // NEVER use new Date() directly
```

### 2. Database is synchronous (better-sqlite3)
```typescript
// No async/await for DB operations
const todos = todoDB.getAll(userId);          // ✅ correct
const todos = await todoDB.getAll(userId);    // ❌ wrong
```

### 3. API route pattern (Next.js 16)
```typescript
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await params;           // params is a Promise in Next.js 16
  // use session.userId for all DB queries
}
```

### 4. Null-safe DB field access
```typescript
counter: authenticator.counter ?? 0
reminder_minutes: todo.reminder_minutes ?? null
```

### 5. Client components never import lib/db.ts
- `app/page.tsx` calls API routes via `fetch()`
- `lib/db.ts` is server-only; imported only in `app/api/**` routes

---

## 🧪 Testing Setup

### playwright.config.ts requirements
```typescript
use: {
  timezoneId: 'Asia/Singapore',
  launchOptions: {
    args: [
      '--enable-features=WebAuthenticationVirtualAuthenticator',
      '--enable-features=WebAuthentication'
    ]
  }
}
```

### tests/helpers.ts must provide
- `createUser()` — registers via virtual WebAuthn authenticator
- `loginUser()` — logs in existing user
- `createTodo(title, options?)` — creates a todo via UI
- `addSubtask(todoId, title)` — adds a subtask
- `createTag(name, color)` — creates a tag

---

## 🏁 How to Use These PRPs with Copilot

Paste the feature PRP into GitHub Copilot Chat with this prompt:

```
I want to implement [Feature Name] for my Next.js 16 Todo App.
Here is the PRP:

[paste full PRP content]

Also reference .github/copilot-instructions.md for project-wide patterns.
Please implement this feature step by step, starting with the database schema.
```

---

## ✅ Evaluation Scoring Summary

| Category | Points |
|----------|--------|
| Feature Completeness (11 × 10 pts) | 110 |
| Testing Coverage | 30 |
| Deployment | 30 |
| Quality & Performance | 30 |
| **Total** | **200** |

| Score | Rating |
|-------|--------|
| 180–200 | 🌟 Excellent — Production ready |
| 160–179 | 🎯 Very Good — Meets all requirements |
| 140–159 | ✅ Good — Minor issues |
| 120–139 | ⚠️ Adequate — Needs improvement |
| < 120 | ❌ Not ready |

---

*Last Updated: November 2025 | Stack: Next.js 16, SQLite, WebAuthn, Tailwind CSS 4*
