'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'high' | 'medium' | 'low';

interface Subtask {
  id: number;
  title: string;
  completed: boolean;
  position: number;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface Todo {
  id: number;
  title: string;
  completed: boolean;
  due_date?: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: string | null;
  subtasks: Subtask[];
  tags: Tag[];
}

interface Holiday {
  id: number;
  date: string; // YYYY-MM-DD
  name: string;
}

interface CalendarDay {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  todos: Todo[];
  holidays: Holiday[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSingaporeToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

function padMonth(m: number): string {
  return String(m).padStart(2, '0');
}

function generateCalendar(
  year: number,
  month: number,
  todos: Todo[],
  holidays: Holiday[],
): CalendarDay[][] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);
  const today    = getSingaporeToday();

  // Group todos by due date (YYYY-MM-DD)
  const todosByDate: Record<string, Todo[]> = {};
  for (const t of todos) {
    if (!t.due_date) continue;
    const key = t.due_date.slice(0, 10);
    (todosByDate[key] ??= []).push(t);
  }

  // Group holidays by date
  const holidaysByDate: Record<string, Holiday[]> = {};
  for (const h of holidays) {
    (holidaysByDate[h.date] ??= []).push(h);
  }

  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];

  // Start from Sunday of the week containing the 1st
  const start = new Date(firstDay);
  start.setDate(start.getDate() - start.getDay());

  // End at Saturday of the week containing the last day
  const end = new Date(lastDay);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const cursor = new Date(start);
  while (cursor <= end) {
    const dateStr = cursor.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const dow     = cursor.getDay();
    week.push({
      date:           new Date(cursor),
      dateStr,
      isCurrentMonth: cursor.getMonth() === month - 1,
      isToday:        dateStr === today,
      isWeekend:      dow === 0 || dow === 6,
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

const PRIORITY_STYLES: Record<Priority, string> = {
  high:   'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low:    'bg-blue-100 text-blue-800',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

function DayCell({ day, onClick }: { day: CalendarDay; onClick: () => void }) {
  const hasTodos    = day.todos.length > 0;
  const hasHolidays = day.holidays.length > 0;

  return (
    <div
      onClick={onClick}
      className={[
        'min-h-[80px] p-1.5 border border-gray-200 cursor-pointer transition-colors hover:bg-blue-50',
        !day.isCurrentMonth && 'bg-gray-50',
        day.isWeekend && day.isCurrentMonth && 'bg-blue-50/40',
        day.isToday && 'ring-2 ring-blue-500 ring-inset',
      ].filter(Boolean).join(' ')}
    >
      {/* Date number */}
      <div className="flex items-center justify-between mb-0.5">
        <span
          className={[
            'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full',
            day.isToday
              ? 'bg-blue-500 text-white'
              : day.isCurrentMonth
              ? 'text-gray-800'
              : 'text-gray-400',
          ].join(' ')}
        >
          {day.date.getDate()}
        </span>
        {hasTodos && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
            {day.todos.length}
          </span>
        )}
      </div>

      {/* Holiday names */}
      {hasHolidays && (
        <div className="space-y-0.5">
          {day.holidays.map((h) => (
            <p key={h.id} className="text-xs text-red-600 truncate leading-tight">{h.name}</p>
          ))}
        </div>
      )}

      {/* Priority dots for todos (up to 3) */}
      {hasTodos && (
        <div className="flex gap-0.5 mt-1 flex-wrap">
          {day.todos.slice(0, 4).map((t) => (
            <span
              key={t.id}
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                t.priority === 'high' ? 'bg-red-500' : t.priority === 'low' ? 'bg-blue-400' : 'bg-yellow-400'
              } ${t.completed ? 'opacity-40' : ''}`}
              title={t.title}
            />
          ))}
          {day.todos.length > 4 && (
            <span className="text-xs text-gray-400">+{day.todos.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}

function DayModal({ day, onClose }: { day: CalendarDay; onClose: () => void }) {
  const formattedDate = day.date.toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 pr-4">{formattedDate}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl flex-shrink-0">✕</button>
        </div>

        {/* Holidays */}
        {day.holidays.map((h) => (
          <div key={h.id} className="flex items-center gap-2 mb-2 text-sm text-red-600">
            <span>🎌</span><span>{h.name}</span>
          </div>
        ))}

        {/* Todos */}
        {day.todos.length === 0 && (
          <p className="text-gray-400 text-sm mt-2">No todos due this day.</p>
        )}
        <ul className="space-y-2 mt-2">
          {day.todos.map((todo) => (
            <li key={todo.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100">
              <span
                className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                  todo.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                }`}
              >
                {todo.completed && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className={`flex-1 text-sm ${todo.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                {todo.title}
              </span>
              <PriorityBadge priority={todo.priority} />
            </li>
          ))}
        </ul>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main calendar content (separated for Suspense boundary)
// ---------------------------------------------------------------------------

function CalendarContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  // Parse month from URL or default to Singapore current month
  const monthParam = searchParams.get('month');
  const [year, month] = (() => {
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      if (y > 0 && m >= 1 && m <= 12) return [y, m];
    }
    const now = new Date();
    const sgDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
    return [sgDate.getFullYear(), sgDate.getMonth() + 1];
  })();

  const [todos, setTodos]       = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

  const currentMonthStr = `${year}-${padMonth(month)}`;

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [todosRes, holidaysRes] = await Promise.all([
        fetch('/api/todos'),
        fetch(`/api/holidays?month=${currentMonthStr}`),
      ]);
      if (todosRes.ok)     setTodos(await todosRes.json());
      if (holidaysRes.ok)  setHolidays((await holidaysRes.json()).holidays);
    } finally {
      setLoading(false);
    }
  }, [currentMonthStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Navigation
  function navigateMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    router.push(`/calendar?month=${d.getFullYear()}-${padMonth(d.getMonth() + 1)}`);
  }

  function goToToday() {
    const now = new Date();
    const sgDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
    router.push(`/calendar?month=${sgDate.getFullYear()}-${padMonth(sgDate.getMonth() + 1)}`);
  }

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const weeks = generateCalendar(year, month, todos, holidays);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Nav bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Todos</Link>
          <h1 className="text-xl font-bold text-gray-800">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateMonth(-1)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            ← Prev
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 border border-blue-300 text-blue-600 rounded-lg text-sm hover:bg-blue-50 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => navigateMonth(1)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <p className="text-gray-400 text-center py-12">Loading calendar…</p>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 bg-gray-100">
            {DOW_LABELS.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day) => (
                <DayCell
                  key={day.dateStr}
                  day={day}
                  onClick={() => setSelectedDay(day)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> High priority</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Medium priority</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Low priority</span>
        <span className="flex items-center gap-1"><span className="text-red-600">🎌</span> Holiday</span>
      </div>

      {/* Day detail modal */}
      {selectedDay && (
        <DayModal day={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export — wrapped in Suspense for useSearchParams
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400">Loading…</p>
      </div>
    }>
      <CalendarContent />
    </Suspense>
  );
}
