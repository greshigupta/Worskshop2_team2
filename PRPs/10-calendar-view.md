# PRP 10 — Calendar View

## Feature Overview
A separate `/calendar` page shows a monthly calendar. Todos with a `due_date` appear on their due date as coloured dots or count badges. Singapore public holidays are highlighted. Users can navigate months and click any day to see all todos due on that day in a modal. URL reflects the current month (`?month=YYYY-MM`).

---

## User Stories
- As a user, I want to see my todos on a calendar so I can visualise my workload.
- As a user, I want Singapore public holidays shown so I can plan around them.
- As a user, I want to click a day to see what's due so I can drill into the details.
- As a user, I want to navigate months so I can plan ahead.

---

## User Flow

### Viewing the Calendar
1. User clicks "Calendar" link in navigation (or navigates to `/calendar`)
2. Current month displayed as a 7-column grid (Sun–Sat)
3. Today highlighted with a coloured circle
4. Weekends styled differently (e.g., lighter background)
5. Singapore holidays shown with their name below the date number
6. Days with due todos show a count badge (e.g., "3")

### Navigating Months
1. **← Prev** / **Next →** buttons change month
2. **Today** button returns to current month
3. URL updates to `?month=YYYY-MM` on navigation
4. Browser back/forward navigate months

### Clicking a Day
1. User clicks any day cell
2. Modal opens: "Todos due on [Day, D Month YYYY]"
3. Lists all todos due on that day (title, priority badge, completion status)
4. Clicking a todo in the modal navigates to the main page with that todo highlighted (optional stretch goal)

---

## Technical Requirements

### Database: Singapore Holidays

```sql
CREATE TABLE IF NOT EXISTS holidays (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  date    TEXT NOT NULL UNIQUE,   -- 'YYYY-MM-DD'
  name    TEXT NOT NULL
);
```

**Seed script** (`scripts/seed-holidays.ts`):
```typescript
import db from '../lib/db';

const SG_HOLIDAYS_2025 = [
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-29', name: "Chinese New Year" },
  { date: '2025-01-30', name: "Chinese New Year" },
  { date: '2025-04-18', name: "Good Friday" },
  { date: '2025-05-01', name: "Labour Day" },
  { date: '2025-05-12', name: "Vesak Day" },
  { date: '2025-06-07', name: "Hari Raya Haji" },
  { date: '2025-08-09', name: "National Day" },
  { date: '2025-10-20', name: "Deepavali" },
  { date: '2025-12-25', name: "Christmas Day" },
  // Add 2026, 2027 etc.
];

for (const h of SG_HOLIDAYS_2025) {
  db.prepare('INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)')
    .run(h.date, h.name);
}
console.log('Holidays seeded.');
```

Run with: `npx tsx scripts/seed-holidays.ts`

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/holidays?month=YYYY-MM` | Returns holidays for a given month |

```typescript
// app/api/holidays/route.ts
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const month = request.nextUrl.searchParams.get('month'); // 'YYYY-MM'
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format' }, { status: 400 });
  }

  const holidays = db.prepare(
    "SELECT * FROM holidays WHERE date LIKE ? ORDER BY date"
  ).all(`${month}-%`);

  return NextResponse.json({ holidays });
}
```

Todos for the calendar are fetched from the existing `GET /api/todos` endpoint — no new endpoint needed.

### Calendar Generation Logic

```typescript
interface CalendarDay {
  date: Date;
  dateStr: string;          // 'YYYY-MM-DD'
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  todos: Todo[];
  holidays: Holiday[];
}

function generateCalendar(year: number, month: number, todos: Todo[], holidays: Holiday[]): CalendarDay[][] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);

  // Build index maps
  const todosByDate    = groupBy(todos.filter(t => t.due_date), t => t.due_date!.slice(0, 10));
  const holidaysByDate = groupBy(holidays, h => h.date);

  const today    = getSingaporeNow().toISOString().slice(0, 10);
  const weeks:   CalendarDay[][] = [];
  let   week:    CalendarDay[]   = [];

  // Start from Sunday of the week containing the 1st
  const start = new Date(firstDay);
  start.setDate(start.getDate() - start.getDay()); // go back to Sunday

  const end = new Date(lastDay);
  end.setDate(end.getDate() + (6 - end.getDay())); // go forward to Saturday

  const cursor = new Date(start);
  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10);
    week.push({
      date:           new Date(cursor),
      dateStr,
      isCurrentMonth: cursor.getMonth() === month - 1,
      isToday:        dateStr === today,
      isWeekend:      cursor.getDay() === 0 || cursor.getDay() === 6,
      todos:          todosByDate[dateStr] ?? [],
      holidays:       holidaysByDate[dateStr] ?? [],
    });

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return weeks;
}
```

### URL State Management

```typescript
// app/calendar/page.tsx — 'use client'
import { useSearchParams, useRouter } from 'next/navigation';

const searchParams = useSearchParams();
const router       = useRouter();

const monthParam  = searchParams.get('month'); // 'YYYY-MM' or null
const [year, month] = monthParam
  ? monthParam.split('-').map(Number)
  : [getSingaporeNow().getFullYear(), getSingaporeNow().getMonth() + 1];

function navigateMonth(delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  router.push(`/calendar?month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
}
```

---

## UI Components

### Calendar Page Layout (`app/calendar/page.tsx`)

```
┌────────────────────────────────────────────────────────┐
│  ← Prev    January 2025    Next →    [Today]           │
├──────┬──────┬──────┬──────┬──────┬──────┬──────────────┤
│ Sun  │ Mon  │ Tue  │ Wed  │ Thu  │ Fri  │ Sat          │
├──────┼──────┼──────┼──────┼──────┼──────┼──────────────┤
│  29  │  30  │  31  │   1  │   2  │   3  │  4           │
│      │      │      │🎆New │      │      │              │
│      │      │      │Year  │      │  🟡2 │              │
├──────┼──────┼──────┼──────┼──────┼──────┼──────────────┤
│  5   │  6   │  7   │  8   │  9   │  10  │ 11           │
│      │ 🔴1  │      │      │      │      │              │
└──────┴──────┴──────┴──────┴──────┴──────┴──────────────┘
```

### Day Cell
```tsx
function DayCell({ day, onClick }: { day: CalendarDay; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={[
        'min-h-[80px] p-1 border cursor-pointer hover:bg-gray-50',
        !day.isCurrentMonth && 'bg-gray-50 text-gray-400',
        day.isWeekend && day.isCurrentMonth && 'bg-blue-50',
        day.isToday && 'ring-2 ring-blue-500',
      ].filter(Boolean).join(' ')}
    >
      <span className={`text-sm font-medium ${day.isToday ? 'bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center' : ''}`}>
        {day.date.getDate()}
      </span>

      {day.holidays.map(h => (
        <p key={h.id} className="text-xs text-red-600 truncate">{h.name}</p>
      ))}

      {day.todos.length > 0 && (
        <span className="inline-flex items-center justify-center w-5 h-5 bg-blue-100 text-blue-800 text-xs rounded-full">
          {day.todos.length}
        </span>
      )}
    </div>
  );
}
```

### Day Detail Modal
```tsx
function DayModal({ day, onClose }: { day: CalendarDay; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>{day.date.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>

        {day.holidays.map(h => (
          <p key={h.id} className="text-red-600">🎌 {h.name}</p>
        ))}

        {day.todos.length === 0 && <p className="text-gray-400">No todos due this day.</p>}
        {day.todos.map(todo => (
          <div key={todo.id} className="flex items-center gap-2">
            <input type="checkbox" checked={todo.completed} readOnly />
            <span className={todo.completed ? 'line-through text-gray-400' : ''}>{todo.title}</span>
            <PriorityBadge priority={todo.priority} />
          </div>
        ))}

        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Month with 5 or 6 weeks | generateCalendar handles variable row count |
| Todos with no due date | Not shown on calendar |
| Multiple holidays same day | All listed in day cell (stacked) |
| Long holiday names | CSS `truncate` in day cell; full name in modal |
| Navigate to month with no todos | Shows empty calendar (no error) |
| `?month=invalid` in URL | Fallback to current month |

---

## Acceptance Criteria

- [ ] `/calendar` route renders the calendar page (protected route)
- [ ] Current month shown by default
- [ ] Today's date highlighted visually
- [ ] Weekends styled differently
- [ ] Singapore holidays displayed with name in day cell
- [ ] Todos appear as count badge on their due date
- [ ] Click day → modal shows todos and holidays for that day
- [ ] Prev / Next buttons navigate months correctly
- [ ] Today button returns to current month
- [ ] URL reflects current month (`?month=YYYY-MM`)
- [ ] Browser back/forward works for month navigation

---

## Testing Requirements

### E2E Tests (`tests/11-calendar.spec.ts`)
```typescript
test('calendar page loads at /calendar')
test('current month displayed by default')
test('today date is highlighted')
test('navigate to previous month')
test('navigate to next month')
test('today button returns to current month')
test('URL updates on month navigation')
test('todo with due date appears on correct day')
test('holiday appears on correct date')
test('click day opens modal with todos')
test('modal shows holiday name')
test('modal closes on click outside or Close button')
```

### Unit Tests
```typescript
test('generateCalendar: first day is Sunday of first week')
test('generateCalendar: last day is Saturday of last week')
test('generateCalendar: days in correct month have isCurrentMonth=true')
test('generateCalendar: today has isToday=true')
test('generateCalendar: todos grouped by date string')
```

---

## Out of Scope
- Creating todos from the calendar
- Drag-and-drop rescheduling on the calendar
- Week or day view
- Holidays for non-Singapore regions

---

## Success Metrics
- Calendar renders in < 300ms including API data fetch
- Month navigation feels instant (URL push + re-render < 100ms)
- Holiday data correct for current year
