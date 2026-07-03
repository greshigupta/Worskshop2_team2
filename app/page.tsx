'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'high' | 'medium' | 'low';
type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface Todo {
  id: number;
  user_id: number;
  title: string;
  description?: string | null;
  completed: boolean;
  due_date?: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string;
}

interface FormState {
  title: string;
  description: string;
  due_date: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: number | null;
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  due_date: '',
  priority: 'medium',
  is_recurring: false,
  recurrence_pattern: 'daily',
  reminder_minutes: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REMINDER_OPTIONS = [
  { label: 'No reminder', value: null },
  { label: '15 minutes before', value: 15 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before',     value: 60 },
  { label: '2 hours before',    value: 120 },
  { label: '1 day before',      value: 1440 },
  { label: '2 days before',     value: 2880 },
  { label: '1 week before',     value: 10080 },
];

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_STYLES: Record<Priority, string> = {
  high:   'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low:    'bg-blue-100 text-blue-800',
};

function sortByPriority(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const pw = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (pw !== 0) return pw;
    if (a.due_date && b.due_date)
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

function isSingaporeOverdue(todo: Todo): boolean {
  if (todo.completed || !todo.due_date) return false;
  const sgNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  return new Date(todo.due_date) < sgNow;
}

function formatDueDate(isoString: string): string {
  return new Date(isoString).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function HomePage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Priority filter
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');

  // Notifications
  const { permission, supported, requestPermission, startPolling } = useNotifications();

  useEffect(() => {
    if (supported && permission === 'granted') {
      const id = startPolling();
      return () => clearInterval(id);
    }
  }, [supported, permission]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Auth bootstrap (dev-login for local development)
  // ---------------------------------------------------------------------------

  const bootstrap = useCallback(async () => {
    // Try to get todos — if 401, do dev-login first
    const res = await fetch('/api/todos');
    if (res.status === 401) {
      const loginRes = await fetch('/api/auth/dev-login', { method: 'POST' });
      if (!loginRes.ok) {
        setError('Authentication failed. Please set up WebAuthn login.');
        setLoading(false);
        return;
      }
    }
    setIsAuthenticated(true);
    await fetchTodos();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // ---------------------------------------------------------------------------
  // Fetch todos
  // ---------------------------------------------------------------------------

  const fetchTodos = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/todos');
      if (!res.ok) throw new Error('Failed to load todos');
      const data: Todo[] = await res.json();
      setTodos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Categorize & sort todos
  // ---------------------------------------------------------------------------

  const visibleTodos =
    priorityFilter === 'all' ? todos : todos.filter((t) => t.priority === priorityFilter);

  const overdue = sortByPriority(
    visibleTodos.filter((t) => isSingaporeOverdue(t)),
  );

  const active = sortByPriority(
    visibleTodos.filter((t) => !t.completed && !isSingaporeOverdue(t)),
  );

  const completed = visibleTodos
    .filter((t) => t.completed)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  // ---------------------------------------------------------------------------
  // Create / Edit handlers
  // ---------------------------------------------------------------------------

  function openCreateModal() {
    setEditingTodo(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  }

  function openEditModal(todo: Todo) {
    setEditingTodo(todo);
    setForm({
      title: todo.title,
      description: todo.description ?? '',
      due_date: todo.due_date
        ? new Date(todo.due_date).toISOString().slice(0, 16)
        : '',
      priority: todo.priority,
      is_recurring: todo.is_recurring,
      recurrence_pattern: todo.recurrence_pattern ?? 'daily',
      reminder_minutes: todo.reminder_minutes,
    });
    setFormError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingTodo(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const title = form.title.trim();
    if (!title) {
      setFormError('Title is required.');
      return;
    }
    if (title.length > 500) {
      setFormError('Title must be 500 characters or fewer.');
      return;
    }
    if (form.description.length > 2000) {
      setFormError('Description must be 2000 characters or fewer.');
      return;
    }

    if (form.is_recurring && !form.due_date) {
      setFormError('Due date is required for recurring todos.');
      return;
    }

    const body: Record<string, unknown> = {
      title,
      description: form.description.trim() || undefined,
      due_date: form.due_date
        ? new Date(form.due_date).toISOString()
        : undefined,
      priority: form.priority,
      is_recurring: form.is_recurring,
      recurrence_pattern: form.is_recurring ? form.recurrence_pattern : null,
      reminder_minutes: form.due_date ? form.reminder_minutes : null,
    };

    setSubmitting(true);

    if (editingTodo) {
      // Optimistic update
      setTodos((prev) =>
        prev.map((t) =>
          t.id === editingTodo.id
            ? {
                ...t,
                title,
                description: (body.description as string) ?? t.description,
                due_date: (body.due_date as string) ?? t.due_date,
                priority: form.priority,
              }
            : t,
        ),
      );
      try {
        const res = await fetch(`/api/todos/${editingTodo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          setFormError(data.error ?? 'Failed to update todo');
          await fetchTodos(); // revert
          setSubmitting(false);
          return;
        }
        const { todo: updated, nextTodo }: { todo: Todo; nextTodo: Todo | null } = await res.json();
        setTodos((prev) => {
          const replaced = prev.map((t) => (t.id === updated.id ? updated : t));
          return nextTodo ? [nextTodo, ...replaced] : replaced;
        });
        closeModal();
      } catch {
        setFormError('Network error. Please try again.');
        await fetchTodos();
      }
    } else {
      // Optimistic add with temp id
      const tempId = -Date.now();
      const optimistic: Todo = {
        id: tempId,
        user_id: 0,
        title,
        description: (body.description as string) ?? null,
        completed: false,
        due_date: (body.due_date as string) ?? null,
        priority: form.priority,
        is_recurring: form.is_recurring,
        recurrence_pattern: form.is_recurring ? form.recurrence_pattern : null,
        reminder_minutes: form.due_date ? form.reminder_minutes : null,
        last_notification_sent: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setTodos((prev) => [optimistic, ...prev]);
      closeModal();
      try {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          setTodos((prev) => prev.filter((t) => t.id !== tempId));
          setFormError(data.error ?? 'Failed to create todo');
          setShowModal(true);
          setSubmitting(false);
          return;
        }
        const created: Todo = await res.json();
        setTodos((prev) => prev.map((t) => (t.id === tempId ? created : t)));
      } catch {
        setTodos((prev) => prev.filter((t) => t.id !== tempId));
        setError('Network error while creating todo.');
        await fetchTodos();
      }
    }

    setSubmitting(false);
  }

  // ---------------------------------------------------------------------------
  // Toggle complete
  // ---------------------------------------------------------------------------

  async function handleToggle(todo: Todo) {
    const newCompleted = !todo.completed;
    // Optimistic
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, completed: newCompleted } : t)),
    );
    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: newCompleted }),
      });
      if (!res.ok) {
        setTodos((prev) =>
          prev.map((t) => (t.id === todo.id ? { ...t, completed: todo.completed } : t)),
        );
      } else {
        const { todo: updated, nextTodo }: { todo: Todo; nextTodo: Todo | null } = await res.json();
        setTodos((prev) => {
          const replaced = prev.map((t) => (t.id === updated.id ? updated : t));
          return nextTodo ? [nextTodo, ...replaced] : replaced;
        });
      }
    } catch {
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, completed: todo.completed } : t)),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleDelete(id: number) {
    // Optimistic remove
    const removed = todos.find((t) => t.id === id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
    setDeletingId(null);
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (!res.ok && removed) {
        setTodos((prev) => [...prev, removed]);
        setError('Failed to delete todo.');
      }
    } catch {
      if (removed) setTodos((prev) => [...prev, removed]);
      setError('Network error while deleting todo.');
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function TodoItem({ todo, accent }: { todo: Todo; accent: string }) {
    return (
      <li className={`flex items-start gap-3 p-3 rounded-lg border ${accent} bg-white`}>
        <button
          onClick={() => handleToggle(todo)}
          className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
            todo.completed
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-gray-400 hover:border-blue-500'
          }`}
          aria-label={todo.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {todo.completed && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-medium break-words ${todo.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {todo.title}
            </p>
            <PriorityBadge priority={todo.priority} />
          </div>
          {todo.description && (
            <p className="text-xs text-gray-500 mt-0.5 break-words">{todo.description}</p>
          )}
          {todo.due_date && (
            <p className={`text-xs mt-0.5 ${isSingaporeOverdue(todo) ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              Due: {formatDueDate(todo.due_date)}
            </p>
          )}
          {todo.is_recurring && (
            <p className="text-xs text-gray-400 mt-0.5">
              🔄 {todo.recurrence_pattern}
            </p>
          )}
          {todo.reminder_minutes !== null && todo.reminder_minutes !== undefined && (
            <p className="text-xs text-gray-400 mt-0.5">
              🔔 {REMINDER_OPTIONS.find(o => o.value === todo.reminder_minutes)?.label ?? `${todo.reminder_minutes}m before`}
            </p>
          )}
        </div>

        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => openEditModal(todo)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
            aria-label="Edit todo"
          >
            ✏️
          </button>
          <button
            onClick={() => setDeletingId(todo.id)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors"
            aria-label="Delete todo"
          >
            🗑️
          </button>
        </div>
      </li>
    );
  }

  function Section({
    icon,
    label,
    items,
    accent,
  }: {
    icon: string;
    label: string;
    items: Todo[];
    accent: string;
  }) {
    if (items.length === 0) return null;
    return (
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {icon} {label} ({items.length})
        </h2>
        <ul className="space-y-2">
          {items.map((t) => (
            <TodoItem key={t.id} todo={t} accent={accent} />
          ))}
        </ul>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isAuthenticated && loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">My Todos</h1>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + New Todo
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <label htmlFor="priority-filter" className="sr-only">Filter by priority</label>
        <select
          id="priority-filter"
          aria-label="Filter by priority"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">All Priorities</option>
          <option value="high">🔴 High</option>
          <option value="medium">🟡 Medium</option>
          <option value="low">🔵 Low</option>
        </select>
        {priorityFilter !== 'all' && (
          <span className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-full">
            Priority: {priorityFilter}
            <button
              onClick={() => setPriorityFilter('all')}
              className="ml-1 hover:text-blue-900"
              aria-label="Clear priority filter"
            >
              ✕
            </button>
          </span>
        )}
        {supported && permission !== 'granted' && (
          <button
            onClick={requestPermission}
            className="flex items-center gap-1 px-3 py-1.5 bg-yellow-50 border border-yellow-300 text-yellow-800 text-xs rounded-lg hover:bg-yellow-100 transition-colors"
          >
            🔔 Enable Notifications
          </button>
        )}
      </div>

      {/* Global error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-gray-400 text-sm text-center py-8">Loading todos…</p>
      )}

      {/* Empty state */}
      {!loading && todos.length === 0 && (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg">No todos yet.</p>
          <button
            onClick={openCreateModal}
            className="mt-3 text-blue-500 underline text-sm"
          >
            Create your first todo
          </button>
        </div>
      )}

      {!loading && todos.length > 0 && overdue.length === 0 && active.length === 0 && completed.length === 0 && (
        <div className="text-center py-10">
          <p className="text-gray-400 text-sm">No todos match the current filter.</p>
          <button onClick={() => setPriorityFilter('all')} className="mt-2 text-blue-500 underline text-sm">
            Clear filter
          </button>
        </div>
      )}

      {/* Sections */}
      {!loading && (
        <>
          <Section icon="🔴" label="Overdue" items={overdue} accent="border-red-200" />
          <Section icon="📋" label="Active" items={active} accent="border-blue-100" />
          <Section icon="✅" label="Completed" items={completed} accent="border-green-100" />
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Create / Edit Modal                                                 */}
      {/* ------------------------------------------------------------------ */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              {editingTodo ? 'Edit Todo' : 'New Todo'}
            </h2>

            {formError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="What needs to be done?"
                  maxLength={500}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional notes…"
                  maxLength={2000}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="datetime-local"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="high">🔴 High</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="low">🔵 Low</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  Repeat
                </label>

                {form.is_recurring && (
                  <div className="mt-2">
                    <select
                      value={form.recurrence_pattern}
                      onChange={(e) => setForm((f) => ({ ...f, recurrence_pattern: e.target.value as RecurrencePattern }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                    {!form.due_date && (
                      <p className="text-red-500 text-xs mt-1">Due date required for recurring todos</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reminder
                </label>
                <select
                  value={form.reminder_minutes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, reminder_minutes: e.target.value ? Number(e.target.value) : null }))}
                  disabled={!form.due_date}
                  title={!form.due_date ? 'Set a due date to enable reminders' : undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {REMINDER_OPTIONS.map((opt) => (
                    <option key={opt.label} value={opt.value ?? ''}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {submitting ? 'Saving…' : editingTodo ? 'Save Changes' : 'Create Todo'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Delete Confirmation Dialog                                          */}
      {/* ------------------------------------------------------------------ */}
      {deletingId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Delete this todo?</h2>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deletingId)}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Yes, delete
              </button>
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
