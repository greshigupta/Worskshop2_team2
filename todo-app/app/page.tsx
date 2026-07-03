'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { isPastDue, formatRelativeDate, minDatetimeLocal } from '@/lib/timezone'

// fmtDueDate wraps formatRelativeDate: { text, colorClass } → { text, cls }
function fmtDueDate(d: string) {
  const { text, colorClass: cls } = formatRelativeDate(d)
  return { text, cls }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority         = 'high' | 'medium' | 'low'
type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface Todo {
  id:                 number
  title:              string
  description:        string | null
  completed:          boolean
  due_date:           string | null
  priority:           Priority
  is_recurring:       boolean
  recurrence_pattern: RecurrencePattern | null
  created_at:         string
  updated_at:         string
}

// ─── Constants (PRP 02 + 03) ─────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

/** PRP 02 — colour-coded badge styles */
const PRIORITY_BADGE: Record<Priority, string> = {
  high:   'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low:    'bg-blue-100 text-blue-800',
}

const PRIORITY_EMOJI: Record<Priority, string> = { high: '🔴', medium: '🟡', low: '🔵' }

const RECURRENCE_LABELS: Record<RecurrencePattern, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
}

// ─── Helpers (isPastDue + minDatetimeLocal imported from lib/timezone) ───────────

/** PRP 02 — sort High→Medium→Low, then by due_date asc, then created_at asc */
function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const pw = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
    if (pw !== 0) return pw
    if (a.due_date && b.due_date)
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    if (a.due_date) return -1
    if (b.due_date) return  1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_BADGE[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  )
}

function RecurringBadge({ pattern }: { pattern: RecurrencePattern }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
      🔄 {pattern}
    </span>
  )
}

// ─── TodoItem ────────────────────────────────────────────────────────────────

interface TodoItemProps {
  todo:       Todo
  onToggle:   (todo: Todo) => void
  onEdit:     (todo: Todo) => void
  onDelete:   (id: number) => void
}

function TodoItem({ todo, onToggle, onEdit, onDelete }: TodoItemProps) {
  const due = todo.due_date ? fmtDueDate(todo.due_date) : null

  return (
    <div className={`flex items-start gap-3 p-4 bg-white rounded-lg border shadow-sm
        ${!todo.completed && todo.due_date && isPastDue(todo.due_date)
          ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>

      {/* Checkbox */}
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo)}
        className="mt-1 h-4 w-4 rounded accent-indigo-600 cursor-pointer shrink-0"
        aria-label={`Mark "${todo.title}" as ${todo.completed ? 'incomplete' : 'complete'}`}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`font-medium break-words ${todo.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {todo.title}
        </p>
        {todo.description && (
          <p className="text-xs text-gray-500 mt-0.5 break-words">{todo.description}</p>
        )}

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <PriorityBadge priority={todo.priority} />
          {todo.is_recurring && todo.recurrence_pattern && (
            <RecurringBadge pattern={todo.recurrence_pattern} />
          )}
          {due && (
            <span className={`text-xs font-medium ${due.cls}`}>{due.text}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      {!todo.completed && (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onEdit(todo)}
            className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(todo.id)}
            className="px-2 py-1 text-xs rounded bg-red-100 hover:bg-red-200 text-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
      {todo.completed && (
        <button
          onClick={() => onDelete(todo.id)}
          className="px-2 py-1 text-xs rounded bg-red-100 hover:bg-red-200 text-red-600 transition-colors shrink-0"
        >
          Delete
        </button>
      )}
    </div>
  )
}

// ─── TodoSection ──────────────────────────────────────────────────────────────

function TodoSection({
  title, todos, emptyMsg, headerClass = '', ...rest
}: {
  title:       string
  todos:       Todo[]
  emptyMsg:    string
  headerClass?: string
  onToggle:    (t: Todo) => void
  onEdit:      (t: Todo) => void
  onDelete:    (id: number) => void
}) {
  if (todos.length === 0) return null
  return (
    <section className="mb-6">
      <h2 className={`text-sm font-bold uppercase tracking-wider mb-2 ${headerClass || 'text-gray-500'}`}>
        {title} ({todos.length})
      </h2>
      <div className="flex flex-col gap-2">
        {todos.length === 0
          ? <p className="text-sm text-gray-400 italic">{emptyMsg}</p>
          : todos.map(t => <TodoItem key={t.id} todo={t} {...rest} />)
        }
      </div>
    </section>
  )
}

// ─── RecurrenceFields ─────────────────────────────────────────────────────────

function RecurrenceFields({
  isRecurring, pattern, hasDueDate,
  onToggle, onPatternChange,
}: {
  isRecurring:     boolean
  pattern:         RecurrencePattern
  hasDueDate:      boolean
  onToggle:        (v: boolean) => void
  onPatternChange: (p: RecurrencePattern) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isRecurring}
          disabled={!hasDueDate}
          onChange={e => onToggle(e.target.checked)}
          className="h-4 w-4 rounded accent-purple-600"
        />
        Repeat
      </label>

      {isRecurring && (
        <select
          value={pattern}
          onChange={e => onPatternChange(e.target.value as RecurrencePattern)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          {(Object.keys(RECURRENCE_LABELS) as RecurrencePattern[]).map(p => (
            <option key={p} value={p}>{RECURRENCE_LABELS[p]}</option>
          ))}
        </select>
      )}

      {!hasDueDate && (
        <span className="text-xs text-gray-400 italic">Set a due date to enable repeat</span>
      )}
    </div>
  )
}

// ─── EditModal ───────────────────────────────────────────────────────────────

function EditModal({
  todo, onClose, onSaved,
}: {
  todo:    Todo
  onClose: () => void
  onSaved: (updated: Todo) => void
}) {
  const [title,     setTitle]     = useState(todo.title)
  const [description, setDescription] = useState(todo.description ?? '')
  const [priority,  setPriority]  = useState<Priority>(todo.priority)
  const [dueDate,   setDueDate]   = useState(todo.due_date?.slice(0, 16) ?? '')
  const [isRec,     setIsRec]     = useState(todo.is_recurring)
  const [pattern,   setPattern]   = useState<RecurrencePattern>(todo.recurrence_pattern ?? 'weekly')
  const [error,     setError]     = useState('')
  const [saving,    setSaving]    = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Title is required'); return }
    if (isRec && !dueDate) { setError('Recurring todos require a due date'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:              title.trim(),
          description:        description.trim() || null,
          priority,
          due_date:           dueDate || null,
          is_recurring:       isRec,
          recurrence_pattern: isRec ? pattern : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error ?? 'Failed to update')
        return
      }
      onSaved(await res.json())
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
        <h2 className="text-lg font-bold mb-4 text-gray-800">Edit Todo</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Add details…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value as Priority)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              aria-label="Edit priority"
            >
              <option value="high">{PRIORITY_EMOJI.high} High</option>
              <option value="medium">{PRIORITY_EMOJI.medium} Medium</option>
              <option value="low">{PRIORITY_EMOJI.low} Low</option>
            </select>
          </div>

          {/* Due date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due date (optional)</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={e => { setDueDate(e.target.value); if (!e.target.value) setIsRec(false) }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Recurring */}
          <RecurrenceFields
            isRecurring={isRec}
            pattern={pattern}
            hasDueDate={!!dueDate}
            onToggle={setIsRec}
            onPatternChange={setPattern}
          />

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── DeleteConfirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
        <p className="font-medium text-gray-800 mb-4">Delete this todo?</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel}  className="px-4 py-2 rounded-md border text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [todos,   setTodos]   = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  // ── Create form ────────────────────────────────────────────────────────────
  const [newTitle,       setNewTitle]       = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority,    setNewPriority]    = useState<Priority>('medium')
  const [newDueDate,     setNewDueDate]     = useState('')
  const [newIsRec,       setNewIsRec]       = useState(false)
  const [newPattern,     setNewPattern]     = useState<RecurrencePattern>('weekly')
  const [createErr,      setCreateErr]      = useState('')
  const [creating,       setCreating]       = useState(false)

  // ── Priority filter (PRP 02) ───────────────────────────────────────────────
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all')

  // ── Edit / delete state ────────────────────────────────────────────────────
  const [editTodo,  setEditTodo]  = useState<Todo | null>(null)
  const [deleteId,  setDeleteId]  = useState<number | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch('/api/todos')
      setTodos(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTodos() }, [fetchTodos])

  // ── Create ─────────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateErr('')
    if (!newTitle.trim()) { setCreateErr('Title is required'); return }
    if (newIsRec && !newDueDate) { setCreateErr('Recurring todos require a due date'); return }

    setCreating(true)
    try {
      const res = await fetch('/api/todos', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:              newTitle.trim(),
          description:        newDescription.trim() || null,
          priority:           newPriority,
          due_date:           newDueDate || null,
          is_recurring:       newIsRec,
          recurrence_pattern: newIsRec ? newPattern : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setCreateErr(err.error ?? 'Failed to create todo')
        return
      }
      const created: Todo = await res.json()
      setTodos(prev => [created, ...prev])
      setNewTitle(''); setNewDescription(''); setNewPriority('medium'); setNewDueDate('')
      setNewIsRec(false); setNewPattern('weekly')
    } catch {
      setCreateErr('Network error')
    } finally {
      setCreating(false)
    }
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────
  async function handleToggle(todo: Todo) {
    // Optimistic update
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, completed: !t.completed } : t))

    const res = await fetch(`/api/todos/${todo.id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ completed: !todo.completed }),
    })

    if (res.ok) {
      // If we just completed a recurring todo, the server spawned a new instance → re-fetch
      if (!todo.completed && todo.is_recurring) fetchTodos()
    } else {
      // Revert optimistic update
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, completed: todo.completed } : t))
    }
  }

  // ── Edit saved ─────────────────────────────────────────────────────────────
  function handleSaved(updated: Todo) {
    setTodos(prev => prev.map(t => t.id === updated.id ? updated : t))
    setEditTodo(null)
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' })
    setTodos(prev => prev.filter(t => t.id !== id))
    setDeleteId(null)
  }

  // ── Derived lists ──────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    todos.filter(t => priorityFilter === 'all' || t.priority === priorityFilter),
  [todos, priorityFilter])

  const sorted    = useMemo(() => sortTodos(filtered), [filtered])
  const overdue   = sorted.filter(t => !t.completed && t.due_date && isPastDue(t.due_date))
  const active    = sorted.filter(t => !t.completed && !(t.due_date && isPastDue(t.due_date)))
  const completed = sorted.filter(t => t.completed)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-2xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📝 Todo App</h1>
        <p className="text-sm text-gray-500 mt-1">Priority system &amp; recurring todos</p>
      </div>

      {/* ── Create form ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">New Todo</h2>

        <form onSubmit={handleCreate} className="space-y-3">
          {/* Title row */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="What needs to be done?"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              required
            />
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {creating ? '…' : 'Add'}
            </button>
          </div>

          {/* Description */}
          <textarea
            placeholder="Description (optional)"
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />

          {/* Priority + due date row */}
          <div className="flex flex-wrap gap-2">
            {/* PRP 02 — priority dropdown */}
            <select
              value={newPriority}
              onChange={e => setNewPriority(e.target.value as Priority)}
              aria-label="Filter by priority"
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="high">{PRIORITY_EMOJI.high} High</option>
              <option value="medium">{PRIORITY_EMOJI.medium} Medium</option>
              <option value="low">{PRIORITY_EMOJI.low} Low</option>
            </select>

            {/* Due date */}
            <input
              type="datetime-local"
              value={newDueDate}
              min={minDatetimeLocal()}
              onChange={e => { setNewDueDate(e.target.value); if (!e.target.value) setNewIsRec(false) }}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* PRP 03 — recurring */}
          <RecurrenceFields
            isRecurring={newIsRec}
            pattern={newPattern}
            hasDueDate={!!newDueDate}
            onToggle={setNewIsRec}
            onPatternChange={setNewPattern}
          />

          {createErr && <p className="text-red-600 text-sm">{createErr}</p>}
        </form>
      </div>

      {/* ── Priority filter toolbar (PRP 02) ───────────────────────────── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <label className="text-sm font-medium text-gray-600" htmlFor="priority-filter">
          Filter:
        </label>
        <select
          id="priority-filter"
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value as Priority | 'all')}
          aria-label="Filter by priority"
          className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="all">All Priorities</option>
          <option value="high">{PRIORITY_EMOJI.high} High</option>
          <option value="medium">{PRIORITY_EMOJI.medium} Medium</option>
          <option value="low">{PRIORITY_EMOJI.low} Low</option>
        </select>

        {/* PRP 02 — active filter indicator with dismiss */}
        {priorityFilter !== 'all' && (
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_BADGE[priorityFilter]}`}>
            Priority: {priorityFilter}
            <button
              onClick={() => setPriorityFilter('all')}
              className="ml-0.5 hover:opacity-70"
              aria-label="Clear priority filter"
            >
              ✕
            </button>
          </span>
        )}
      </div>

      {/* ── Todo sections ───────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-center text-gray-400 py-12">Loading…</p>
      ) : (
        <>
          <TodoSection
            title="⚠️ Overdue"
            todos={overdue}
            emptyMsg=""
            headerClass="text-red-600"
            onToggle={handleToggle}
            onEdit={setEditTodo}
            onDelete={setDeleteId}
          />

          <TodoSection
            title="📌 Active"
            todos={active}
            emptyMsg="No active todos — great job!"
            headerClass="text-indigo-600"
            onToggle={handleToggle}
            onEdit={setEditTodo}
            onDelete={setDeleteId}
          />

          <TodoSection
            title="✅ Completed"
            todos={completed}
            emptyMsg=""
            headerClass="text-green-600"
            onToggle={handleToggle}
            onEdit={setEditTodo}
            onDelete={setDeleteId}
          />

          {filtered.length === 0 && !loading && (
            <p className="text-center text-gray-400 py-12 text-sm">
              {priorityFilter !== 'all'
                ? `No todos with ${priorityFilter} priority.`
                : 'No todos yet — add your first one above!'}
            </p>
          )}
        </>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {editTodo && (
        <EditModal
          todo={editTodo}
          onClose={() => setEditTodo(null)}
          onSaved={handleSaved}
        />
      )}

      {deleteId !== null && (
        <DeleteConfirm
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </main>
  )
}
