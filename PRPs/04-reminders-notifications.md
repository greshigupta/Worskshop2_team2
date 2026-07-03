# PRP 04 — Reminders & Notifications

## Feature Overview
Users can set a reminder on any todo that has a due date. The app polls a backend endpoint every 30 seconds and fires browser notifications when the reminder time is reached. Duplicate notifications are prevented via a `last_notification_sent` timestamp. All time calculations use **Singapore timezone**.

---

## User Stories
- As a user, I want to receive a browser notification before a todo is due so I don't miss it.
- As a user, I want to choose how far in advance I'm reminded (15 min to 1 week).
- As a user, I only want one notification per reminder — not repeated every 30 seconds.
- As a user, I want the reminder option disabled if I haven't set a due date.

---

## User Flow

### Enabling Notifications
1. First visit: "Enable Notifications" button visible in toolbar
2. User clicks → browser permission prompt appears
3. On grant: button disappears, polling begins

### Setting a Reminder
1. In create/edit form, user sees **"Reminder"** dropdown (disabled until due date set)
2. Options: None / 15 min / 30 min / 1 hour / 2 hours / 1 day / 2 days / 1 week
3. On save, `reminder_minutes` stored in database
4. 🔔 badge with timing label shown on the todo card

### Receiving a Notification
1. Background polling (every 30 seconds) calls `GET /api/notifications/check`
2. API returns todos whose reminder time has passed and haven't been notified yet
3. Browser fires notification: "Todo Due Soon: [title] — due [time]"
4. `last_notification_sent` updated to prevent duplicates

---

## Technical Requirements

### Database Changes

```sql
-- Add to todos table (migration-safe ALTER TABLE in try/catch)
ALTER TABLE todos ADD COLUMN reminder_minutes INTEGER;
ALTER TABLE todos ADD COLUMN last_notification_sent TEXT;
```

```typescript
// Update Todo interface in lib/db.ts
export interface Todo {
  // ... existing fields
  reminder_minutes: number | null;
  last_notification_sent: string | null;
}
```

### Reminder Options

```typescript
export const REMINDER_OPTIONS = [
  { label: 'No reminder', value: null },
  { label: '15 minutes before', value: 15 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before',     value: 60 },
  { label: '2 hours before',    value: 120 },
  { label: '1 day before',      value: 1440 },
  { label: '2 days before',     value: 2880 },
  { label: '1 week before',     value: 10080 },
];
```

### Notification Check Logic

**Reminder fires when:**  
`current_time >= due_date - reminder_minutes` **AND** `last_notification_sent` is null or was sent more than `reminder_minutes` minutes ago (prevents re-fire on next poll).

```typescript
// app/api/notifications/check/route.ts
import { getSingaporeNow } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const now = getSingaporeNow();
  const todos = notificationDB.getTodosNeedingNotification(session.userId, now.toISOString());

  // Update last_notification_sent for each
  for (const todo of todos) {
    notificationDB.markNotificationSent(todo.id, now.toISOString());
  }

  return NextResponse.json({ todos });
}
```

**SQL query for `getTodosNeedingNotification`:**
```sql
SELECT * FROM todos
WHERE user_id = ?
  AND completed = 0
  AND reminder_minutes IS NOT NULL
  AND due_date IS NOT NULL
  AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= ?
  AND (last_notification_sent IS NULL
       OR datetime(last_notification_sent, '+' || reminder_minutes || ' minutes') <= ?)
```

### Custom Hook (`lib/hooks/useNotifications.ts`)

```typescript
export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    setPermission(Notification.permission);
  }, []);

  const requestPermission = async () => {
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const startPolling = (userId: number) => {
    return setInterval(async () => {
      if (Notification.permission !== 'granted') return;
      try {
        const res = await fetch('/api/notifications/check');
        const data = await res.json();
        for (const todo of data.todos ?? []) {
          new Notification('Todo Due Soon', {
            body: `${todo.title} — due ${new Date(todo.due_date).toLocaleTimeString('en-SG')}`,
            icon: '/favicon.ico',
          });
        }
      } catch { /* silently fail */ }
    }, 30_000);
  };

  return { permission, requestPermission, startPolling };
}
```

### API Changes

**POST `/api/todos`** — accept optional `reminder_minutes`  
**PUT `/api/todos/[id]`** — accept optional `reminder_minutes`

**Validation:**
```typescript
if (reminder_minutes !== null && reminder_minutes !== undefined) {
  const validValues = [15, 30, 60, 120, 1440, 2880, 10080];
  if (!validValues.includes(reminder_minutes)) {
    return NextResponse.json({ error: 'Invalid reminder_minutes value' }, { status: 400 });
  }
  if (!due_date && !existingTodo?.due_date) {
    return NextResponse.json({ error: 'Reminder requires a due date' }, { status: 400 });
  }
}
```

---

## UI Components (`app/page.tsx`)

### Enable Notifications Button (toolbar)
```tsx
{Notification.permission !== 'granted' && (
  <button onClick={requestPermission}>
    🔔 Enable Notifications
  </button>
)}
```

### Reminder Dropdown (in forms)
```tsx
<select
  value={reminderMinutes ?? ''}
  onChange={(e) => setReminderMinutes(e.target.value ? Number(e.target.value) : null)}
  disabled={!dueDate}
  title={!dueDate ? 'Set a due date to enable reminders' : ''}
>
  {REMINDER_OPTIONS.map(opt => (
    <option key={opt.label} value={opt.value ?? ''}>
      {opt.label}
    </option>
  ))}
</select>
```

### Reminder Badge on Todo Card
```tsx
{todo.reminder_minutes && (
  <span className="text-xs text-gray-500">
    🔔 {REMINDER_OPTIONS.find(o => o.value === todo.reminder_minutes)?.label ?? `${todo.reminder_minutes}m before`}
  </span>
)}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Browser notifications not supported | Hide "Enable Notifications" button; no polling |
| User denies notification permission | Show disabled state; don't poll |
| Reminder set but due date removed later | Clear `reminder_minutes` when `due_date` is cleared |
| Multiple tabs open | Each tab polls independently; `last_notification_sent` prevents duplicate notifications |
| Todo completed before reminder fires | API query filters `completed = 0` — no notification sent |
| Server is down during poll | Fail silently; retry on next poll interval |

---

## Acceptance Criteria

- [ ] "Enable Notifications" button requests browser permission
- [ ] Reminder dropdown disabled when no due date set
- [ ] All 7 reminder timing options available
- [ ] 🔔 badge with timing label shown on todo card
- [ ] Notification fires at the correct time (within one 30s polling cycle)
- [ ] Only one notification per reminder (no duplicate on next poll)
- [ ] Completed todos do not trigger notifications
- [ ] Reminder clears if due date is removed

---

## Testing Requirements

### E2E Tests (`tests/05-reminders.spec.ts`)
```typescript
test('reminder dropdown disabled without due date')
test('reminder dropdown enabled when due date set')
test('set 15-minute reminder — badge shows "15 minutes before"')
test('API notifications/check returns overdue reminder todo')
test('API notifications/check does not return already-notified todo')
test('API notifications/check does not return completed todo')
```

### Unit Tests
```typescript
test('getTodosNeedingNotification: returns todo past reminder time')
test('getTodosNeedingNotification: skips already notified within window')
test('getTodosNeedingNotification: skips completed todos')
test('REMINDER_OPTIONS contains all 7 values plus null')
```

### Manual Tests
- [ ] Grant browser notification permission — works in Chrome/Edge
- [ ] Set a 15-minute reminder, wait for due time — notification fires
- [ ] Notification includes correct todo title and time

---

## Out of Scope
- Push notifications (service worker) — browser polling only
- Email/SMS reminders
- Snoozing notifications
- Custom reminder times beyond the 7 presets

---

## Success Metrics
- Notification fires within 30 seconds of the reminder time
- Zero duplicate notifications per reminder event
- Polling adds < 5ms overhead to the browser main thread
