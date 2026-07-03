'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useNotifications } from '@/lib/hooks/useNotifications';

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

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
  subtasks: Subtask[];
  tags: Tag[];
}

interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

interface Template {
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
  subtasks_json: string | null;
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
  selectedTagIds: number[];
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  due_date: '',
  priority: 'medium',
  is_recurring: false,
  recurrence_pattern: 'daily',
  reminder_minutes: null,
  selectedTagIds: [],
};

const PRESET_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280',
];

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

function TagBadge({ tag, onClick }: { tag: Tag; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-0.5 rounded-full text-xs font-medium text-white transition-opacity hover:opacity-80"
      style={{ backgroundColor: tag.color }}
      title={`Filter by: ${tag.name}`}
    >
      {tag.name}
    </button>
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
  const [currentUser, setCurrentUser] = useState<string | null>(null);
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

  // Search
  const [rawSearch, setRawSearch] = useState('');

  // Tag filter
  const [activeTagFilter, setActiveTagFilter] = useState<Tag | null>(null);

  // All tags (for selectors + manage modal)
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showManageTags, setShowManageTags] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  const [tagFormError, setTagFormError] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('');

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateSourceTodo, setTemplateSourceTodo] = useState<Todo | null>(null);
  const [tmplName, setTmplName] = useState('');
  const [tmplDesc, setTmplDesc] = useState('');
  const [tmplCategory, setTmplCategory] = useState('');
  const [showUseTemplate, setShowUseTemplate] = useState(false);
  const [tmplCategoryFilter, setTmplCategoryFilter] = useState('');
  const [deletingTemplateId, setDeletingTemplateId] = useState<number | null>(null);

  // Export / Import
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  function validateExportFormat(data: unknown): string | null {
    if (!data || typeof data !== 'object') return 'File is not valid JSON';
    const d = data as Record<string, unknown>;
    if (d.version !== '1.0') return `Unsupported version: ${String(d.version)}`;
    if (!Array.isArray(d.todos)) return 'Missing todos array';
    if (!Array.isArray(d.tags)) return 'Missing tags array';
    return null;
  }

  // Expanded subtask sections (Set of todo IDs)
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<number>>(new Set());

  function toggleSubtaskSection(todoId: number) {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
  }

  // Notifications
  const { permission, supported, requestPermission, startPolling } = useNotifications();

  useEffect(() => {
    if (supported && permission === 'granted') {
      const id = startPolling();
      return () => clearInterval(id);
    }
  }, [supported, permission]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Auth bootstrap
  // ---------------------------------------------------------------------------

  const bootstrap = useCallback(async () => {
    // Verify session via /api/auth/me
    const meRes = await fetch('/api/auth/me');
    if (!meRes.ok) {
      // Middleware should redirect to /login, but in case it doesn't:
      window.location.href = '/login';
      return;
    }
    const me = await meRes.json();
    setCurrentUser(me.username);
    setIsAuthenticated(true);
    await Promise.all([fetchTodos(), fetchTags(), fetchTemplates()]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

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

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      if (res.ok) {
        const data: Tag[] = await res.json();
        setAllTags(data);
      }
    } catch {
      // silently fail
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data: Template[] = await res.json();
        setTemplates(data);
      }
    } catch {
      // silently fail
    }
  };

  // ---------------------------------------------------------------------------
  // Categorize & sort todos
  // ---------------------------------------------------------------------------

  const searchQuery = useDebounce(rawSearch, 300);

  const visibleTodos = todos.filter((todo) => {
    // 1. Text search — title OR tag names
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesTitle = todo.title.toLowerCase().includes(q);
      const matchesTag = todo.tags.some((t) => t.name.toLowerCase().includes(q));
      if (!matchesTitle && !matchesTag) return false;
    }
    // 2. Priority filter
    if (priorityFilter !== 'all' && todo.priority !== priorityFilter) return false;
    // 3. Tag filter
    if (activeTagFilter && !todo.tags.some((t) => t.id === activeTagFilter.id)) return false;
    return true;
  });

  const hasActiveFilters = rawSearch !== '' || priorityFilter !== 'all' || activeTagFilter !== null;

  function clearAllFilters() {
    setRawSearch('');
    setPriorityFilter('all');
    setActiveTagFilter(null);
  }

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
      selectedTagIds: todo.tags.map((t) => t.id),
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
        // Set tags for updated todo
        if (form.selectedTagIds.length > 0 || editingTodo.tags.length > 0) {
          await fetch(`/api/todos/${editingTodo.id}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagIds: form.selectedTagIds }),
          });
        }
        // Refresh to get accurate tag state
        const selectedTags = allTags.filter((t) => form.selectedTagIds.includes(t.id));
        const withTags = { ...updated, tags: selectedTags };
        setTodos((prev) => {
          const replaced = prev.map((t) => (t.id === withTags.id ? withTags : t));
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
        subtasks: [],
        tags: allTags.filter((t) => form.selectedTagIds.includes(t.id)),
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
        // Set tags
        if (form.selectedTagIds.length > 0) {
          await fetch(`/api/todos/${created.id}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagIds: form.selectedTagIds }),
          });
        }
        const withTags = { ...created, tags: allTags.filter((t) => form.selectedTagIds.includes(t.id)) };
        setTodos((prev) => prev.map((t) => (t.id === tempId ? withTags : t)));
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
  // Tag management handlers
  // ---------------------------------------------------------------------------

  async function handleCreateTag() {
    setTagFormError(null);
    const name = newTagName.trim();
    if (!name) { setTagFormError('Name is required.'); return; }
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: newTagColor }),
    });
    const data = await res.json();
    if (!res.ok) { setTagFormError(data.error ?? 'Failed to create tag'); return; }
    setAllTags((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewTagName('');
    setNewTagColor('#3B82F6');
  }

  async function handleUpdateTag(tagId: number) {
    const name = editTagName.trim();
    if (!name) return;
    const res = await fetch(`/api/tags/${tagId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: editTagColor }),
    });
    if (!res.ok) return;
    const updated: Tag = await res.json();
    setAllTags((prev) => prev.map((t) => (t.id === tagId ? updated : t)));
    // Update any todos that have this tag
    setTodos((prev) =>
      prev.map((todo) => ({
        ...todo,
        tags: todo.tags.map((t) => (t.id === tagId ? updated : t)),
      })),
    );
    setEditingTag(null);
  }

  async function handleDeleteTag(tagId: number) {
    const res = await fetch(`/api/tags/${tagId}`, { method: 'DELETE' });
    if (!res.ok) return;
    setAllTags((prev) => prev.filter((t) => t.id !== tagId));
    setTodos((prev) =>
      prev.map((todo) => ({ ...todo, tags: todo.tags.filter((t) => t.id !== tagId) })),
    );
    if (activeTagFilter?.id === tagId) setActiveTagFilter(null);
  }

  // ---------------------------------------------------------------------------
  // Template handlers
  // ---------------------------------------------------------------------------

  function openSaveAsTemplate(todo: Todo) {
    setTemplateSourceTodo(todo);
    setTmplName(todo.title);
    setTmplDesc('');
    setTmplCategory('');
    setShowSaveTemplate(true);
  }

  async function handleSaveTemplate() {
    if (!templateSourceTodo || !tmplName.trim()) return;
    const todo = templateSourceTodo;

    // Calculate offset days
    let due_date_offset_days: number | null = null;
    if (todo.due_date) {
      const msPerDay = 86_400_000;
      const diff = new Date(todo.due_date).getTime() - Date.now();
      due_date_offset_days = Math.max(0, Math.round(diff / msPerDay));
    }

    const subtasks = todo.subtasks.map((s, i) => ({ title: s.title, position: i }));

    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: tmplName.trim(),
        description: tmplDesc.trim() || undefined,
        category: tmplCategory.trim() || undefined,
        title: todo.title,
        notes: todo.description ?? undefined,
        priority: todo.priority,
        is_recurring: todo.is_recurring,
        recurrence_pattern: todo.recurrence_pattern,
        reminder_minutes: todo.reminder_minutes,
        due_date_offset_days,
        subtasks,
      }),
    });
    if (res.ok) {
      const template: Template = await res.json();
      setTemplates((prev) => [...prev, template].sort((a, b) => a.name.localeCompare(b.name)));
      setShowSaveTemplate(false);
    }
  }

  async function handleUseTemplate(templateId: number) {
    const res = await fetch(`/api/templates/${templateId}/use`, { method: 'POST' });
    if (!res.ok) return;
    const todo: Todo = await res.json();
    setTodos((prev) => [todo, ...prev]);
    setShowUseTemplate(false);
  }

  async function handleDeleteTemplate(templateId: number) {
    const res = await fetch(`/api/templates/${templateId}`, { method: 'DELETE' });
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    }
    setDeletingTemplateId(null);
  }

  // ---------------------------------------------------------------------------
  // Export / Import handlers
  // ---------------------------------------------------------------------------

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await fetch('/api/todos/export');
      if (!res.ok) { showToast('Export failed', 'error'); return; }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `todos-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      showToast('Import failed: file is not valid JSON', 'error');
      e.target.value = '';
      return;
    }
    const err = validateExportFormat(data);
    if (err) { showToast(`Import failed: ${err}`, 'error'); e.target.value = ''; return; }
    const res = await fetch('/api/todos/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: text,
    });
    const result = await res.json();
    if (!res.ok) { showToast(`Import failed: ${result.error}`, 'error'); }
    else {
      showToast(`Imported ${result.imported.todos} todos and ${result.imported.tags} tags`, 'success');
      await fetchTodos();
      await fetchTags();
    }
    e.target.value = '';
  }

  // ---------------------------------------------------------------------------
  // Subtask helpers
  // ---------------------------------------------------------------------------

  function updateTodoSubtasks(todoId: number, updater: (prev: Subtask[]) => Subtask[]) {
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, subtasks: updater(t.subtasks) } : t)),
    );
  }

  async function addSubtask(todoId: number, title: string) {
    const res = await fetch(`/api/todos/${todoId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return;
    const subtask: Subtask = await res.json();
    updateTodoSubtasks(todoId, (prev) => [...prev, subtask]);
  }

  async function toggleSubtask(todoId: number, subtask: Subtask) {
    const newCompleted = !subtask.completed;
    // Optimistic
    updateTodoSubtasks(todoId, (prev) =>
      prev.map((s) => (s.id === subtask.id ? { ...s, completed: newCompleted } : s)),
    );
    const res = await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: newCompleted, todo_id: todoId }),
    });
    if (!res.ok) {
      // Revert
      updateTodoSubtasks(todoId, (prev) =>
        prev.map((s) => (s.id === subtask.id ? { ...s, completed: subtask.completed } : s)),
      );
    }
  }

  async function deleteSubtask(todoId: number, subtaskId: number) {
    updateTodoSubtasks(todoId, (prev) => prev.filter((s) => s.id !== subtaskId));
    await fetch(`/api/subtasks/${subtaskId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ todo_id: todoId }),
    });
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function TodoItem({ todo, accent }: { todo: Todo; accent: string }) {
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const isExpanded = expandedSubtasks.has(todo.id);
    const { completed: doneCount, total, percent } = (() => {
      const total = todo.subtasks.length;
      const completed = todo.subtasks.filter((s) => s.completed).length;
      return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
    })();

    return (
      <li className={`flex flex-col p-4 rounded-2xl border ${accent} bg-white shadow-sm hover:shadow-md`}>
        <div className="flex items-start gap-3">
          <button
            onClick={() => handleToggle(todo)}
            className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded-md border-2 flex items-center justify-center ${
              todo.completed
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-gray-300 hover:border-blue-500'
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
              <p className={`text-sm font-semibold break-words ${todo.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                {todo.title}
              </p>
              <PriorityBadge priority={todo.priority} />
            </div>
            {todo.description && (
              <p className="text-xs text-gray-500 mt-1 break-words leading-relaxed">{todo.description}</p>
            )}
            {todo.due_date && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${isSingaporeOverdue(todo) ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                <span>📅</span> {formatDueDate(todo.due_date)}
                {isSingaporeOverdue(todo) && <span className="text-red-400">(overdue)</span>}
              </p>
            )}
            {todo.is_recurring && (
              <p className="text-xs text-indigo-400 mt-0.5 flex items-center gap-1">
                🔄 <span className="capitalize">{todo.recurrence_pattern}</span>
              </p>
            )}
            {todo.reminder_minutes !== null && todo.reminder_minutes !== undefined && (
              <p className="text-xs text-amber-500 mt-0.5">
                🔔 {REMINDER_OPTIONS.find(o => o.value === todo.reminder_minutes)?.label ?? `${todo.reminder_minutes}m before`}
              </p>
            )}
            {/* Tag badges */}
            {todo.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {todo.tags.map((tag) => (
                  <TagBadge key={tag.id} tag={tag} onClick={() => setActiveTagFilter(tag)} />
                ))}
              </div>
            )}
            {/* Collapsed progress bar */}
            {total > 0 && !isExpanded && (
              <div className="mt-2">
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${percent === 100 ? 'bg-green-400' : 'bg-blue-400'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-0.5 flex-shrink-0">
            <button
              onClick={() => openSaveAsTemplate(todo)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-green-500"
              aria-label="Save as template"
              title="Save as Template"
            >
              📋
            </button>
            <button
              onClick={() => openEditModal(todo)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-blue-500"
              aria-label="Edit todo"
            >
              ✏️
            </button>
            <button
              onClick={() => setDeletingId(todo.id)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-red-500"
              aria-label="Delete todo"
            >
              🗑️
            </button>
          </div>
        </div>

        {/* Subtasks toggle */}
        <button
          onClick={() => toggleSubtaskSection(todo.id)}
          className="mt-2 self-start text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {isExpanded ? '▴ Subtasks' : '▾ Subtasks'} {total > 0 ? `(${doneCount}/${total})` : ''}
        </button>

        {/* Subtask list */}
        {isExpanded && (
          <div className="mt-2 pl-8 space-y-1">
            {/* Progress bar */}
            {total > 0 && (
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{doneCount}/{total} completed ({percent}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${percent === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            )}

            {todo.subtasks.map((subtask) => (
              <div key={subtask.id} className="flex items-center gap-2 group">
                <button
                  onClick={() => toggleSubtask(todo.id, subtask)}
                  className={`w-4 h-4 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                    subtask.completed
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'border-gray-300 hover:border-blue-400'
                  }`}
                  aria-label={subtask.completed ? 'Mark incomplete' : 'Mark complete'}
                >
                  {subtask.completed && (
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className={`text-xs flex-1 truncate ${subtask.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {subtask.title}
                </span>
                <button
                  onClick={() => deleteSubtask(todo.id, subtask.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-0.5"
                  aria-label="Delete subtask"
                >
                  🗑️
                </button>
              </div>
            ))}

            <div className="flex gap-2 mt-2">
              <input
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                    addSubtask(todo.id, newSubtaskTitle.trim());
                    setNewSubtaskTitle('');
                  }
                }}
                placeholder="Add a subtask…"
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => {
                  if (newSubtaskTitle.trim()) {
                    addSubtask(todo.id, newSubtaskTitle.trim());
                    setNewSubtaskTitle('');
                  }
                }}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        )}
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
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">{icon}</span>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{label}</h2>
          <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full font-medium">{items.length}</span>
        </div>
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
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading…</p>
        </div>
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200 flex-shrink-0">
            <span className="text-white text-base font-bold">✓</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">My Todos</h1>
            <Link href="/calendar" className="text-xs text-blue-500 hover:text-blue-700">
              📅 Calendar view
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {currentUser && (
            <span className="text-xs text-gray-500 hidden sm:block">👤 {currentUser}</span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-500 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50"
          >
            Sign out
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5"
          >
            <span className="text-base leading-none">+</span> New Todo
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <input
          type="search"
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          placeholder="Search todos and tags…"
          aria-label="Search todos"
          className="w-full pl-10 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
        />
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</span>
        {rawSearch && (
          <button
            onClick={() => setRawSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full text-xs"
            aria-label="Clear search"
          >✕</button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <label htmlFor="priority-filter" className="sr-only">Filter by priority</label>
        <select
          id="priority-filter"
          aria-label="Filter by priority"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        >
          <option value="all">All Priorities</option>
          <option value="high">🔴 High</option>
          <option value="medium">🟡 Medium</option>
          <option value="low">🔵 Low</option>
        </select>
        {supported && permission !== 'granted' && (
          <button
            onClick={requestPermission}
            className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg hover:bg-amber-100"
          >
            🔔 Notifications
          </button>
        )}
        <button
          onClick={() => setShowManageTags(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 shadow-sm"
        >
          🏷️ Tags
        </button>
        <button
          onClick={() => setShowUseTemplate(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 shadow-sm"
        >
          📋 Templates
        </button>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50 shadow-sm"
        >
          {isExporting ? 'Exporting…' : '⬇️ Export'}
        </button>
        <label className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 cursor-pointer shadow-sm">
          ⬆️ Import
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
        </label>
      </div>

      {/* Active filters bar */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap mb-4 p-2 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-xs text-gray-500 font-medium">Filters:</span>
          {searchQuery.trim() && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-300 text-gray-700 text-xs rounded-full">
              Search: “{searchQuery.trim()}”
              <button onClick={() => setRawSearch('')} className="ml-1 hover:text-red-500" aria-label="Clear search filter">✕</button>
            </span>
          )}
          {priorityFilter !== 'all' && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-white border border-blue-200 text-blue-700 text-xs rounded-full shadow-sm">
              {priorityFilter}
              <button onClick={() => setPriorityFilter('all')} className="ml-1 hover:text-red-500" aria-label="Clear priority filter">✕</button>
            </span>
          )}
          {activeTagFilter && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-white text-xs rounded-full border shadow-sm" style={{ borderColor: activeTagFilter.color }}>
              <TagBadge tag={activeTagFilter} />
              <button onClick={() => setActiveTagFilter(null)} className="ml-0.5 text-gray-400 hover:text-red-500" aria-label="Clear tag filter">✕</button>
            </span>
          )}
          <button
            onClick={clearAllFilters}
            className="text-xs text-red-400 hover:text-red-600 ml-auto font-medium"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Global error */}
      {error && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
          <span className="flex-shrink-0">❌</span>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-xs underline opacity-70 hover:opacity-100">dismiss</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Loading todos…</p>
          </div>
        </div>
      )}

      {/* Empty state — no todos at all */}
      {!loading && todos.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📝</span>
          </div>
          <p className="text-gray-500 font-medium mb-1">No todos yet</p>
          <p className="text-gray-400 text-sm mb-4">Create your first todo to get started</p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            + Create a todo
          </button>
        </div>
      )}

      {/* Empty state — filters active but no results */}
      {!loading && todos.length > 0 && visibleTodos.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🔍</span>
          </div>
          <p className="text-gray-500 font-medium mb-1">No results</p>
          <p className="text-gray-400 text-sm mb-3">No todos match your current filters</p>
          <button onClick={clearAllFilters} className="text-blue-500 hover:text-blue-700 text-sm font-medium">
            Clear filters
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
          <div className="bg-white rounded-2xl shadow-2xl shadow-blue-100/50 w-full max-w-md p-6 border border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
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

              {/* Tags selector */}
              {allTags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => (
                      <label key={tag.id} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.selectedTagIds.includes(tag.id)}
                          onChange={() =>
                            setForm((f) => ({
                              ...f,
                              selectedTagIds: f.selectedTagIds.includes(tag.id)
                                ? f.selectedTagIds.filter((id) => id !== tag.id)
                                : [...f.selectedTagIds, tag.id],
                            }))
                          }
                          className="w-3.5 h-3.5"
                        />
                        <TagBadge tag={tag} />
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {allTags.length === 0 && (
                <p className="text-xs text-gray-400">No tags yet. Create some in “Manage Tags”.</p>
              )}

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
      {/* Save as Template Modal                                              */}
      {/* ------------------------------------------------------------------ */}
      {showSaveTemplate && templateSourceTodo && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSaveTemplate(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Save as Template</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Template Name *</label>
                <input
                  type="text"
                  value={tmplName}
                  onChange={(e) => setTmplName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input
                  type="text"
                  value={tmplDesc}
                  onChange={(e) => setTmplDesc(e.target.value)}
                  placeholder="Optional description…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <input
                  list="template-categories"
                  type="text"
                  value={tmplCategory}
                  onChange={(e) => setTmplCategory(e.target.value)}
                  placeholder="e.g. Work, Personal…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="template-categories">
                  {[...new Set(templates.map((t) => t.category).filter(Boolean))].map((cat) => (
                    <option key={cat!} value={cat!} />
                  ))}
                </datalist>
              </div>
              <div className="text-xs text-gray-400 bg-gray-50 rounded p-2">
                Captures: title, priority{templateSourceTodo.is_recurring ? ', recurrence' : ''}{templateSourceTodo.reminder_minutes ? ', reminder' : ''}{templateSourceTodo.subtasks.length > 0 ? `, ${templateSourceTodo.subtasks.length} subtask(s)` : ''}
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSaveTemplate}
                disabled={!tmplName.trim()}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
              >
                Save Template
              </button>
              <button
                onClick={() => setShowSaveTemplate(false)}
                className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Use Template Modal                                                  */}
      {/* ------------------------------------------------------------------ */}
      {showUseTemplate && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowUseTemplate(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Use Template</h2>
              <button onClick={() => setShowUseTemplate(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Category filter */}
            {templates.length > 0 && (
              <div className="mb-3">
                <select
                  value={tmplCategoryFilter}
                  onChange={(e) => setTmplCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">All Categories</option>
                  {[...new Set(templates.map((t) => t.category).filter(Boolean))].map((cat) => (
                    <option key={cat!} value={cat!}>{cat}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="overflow-y-auto flex-1 space-y-2">
              {templates.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No templates yet. Save a todo as a template first.</p>
              )}
              {templates
                .filter((t) => !tmplCategoryFilter || t.category === tmplCategoryFilter)
                .map((tmpl) => {
                  const subtaskCount = (() => { try { return (JSON.parse(tmpl.subtasks_json ?? '[]') as unknown[]).length; } catch { return 0; } })();
                  return (
                    <div key={tmpl.id} className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-800">{tmpl.name}</p>
                            {tmpl.category && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">{tmpl.category}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {tmpl.title} &middot; <span className={`font-medium ${tmpl.priority === 'high' ? 'text-red-500' : tmpl.priority === 'low' ? 'text-blue-500' : 'text-yellow-600'}`}>{tmpl.priority}</span>
                            {tmpl.is_recurring && ` · 🔄 ${tmpl.recurrence_pattern}`}
                            {subtaskCount > 0 && ` · ${subtaskCount} subtask${subtaskCount > 1 ? 's' : ''}`}
                            {tmpl.reminder_minutes && ` · 🔔 ${REMINDER_OPTIONS.find(o => o.value === tmpl.reminder_minutes)?.label ?? `${tmpl.reminder_minutes}m`}`}
                          </p>
                          {tmpl.due_date_offset_days != null && (
                            <p className="text-xs text-gray-400">Due +{tmpl.due_date_offset_days} day(s) from today</p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleUseTemplate(tmpl.id)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors"
                          >
                            Use
                          </button>
                          <button
                            onClick={() => setDeletingTemplateId(tmpl.id)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            aria-label="Delete template"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Template delete confirmation */}
      {deletingTemplateId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Delete this template?</h2>
            <p className="text-sm text-gray-500 mb-5">Todos created from it are not affected.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDeleteTemplate(deletingTemplateId)}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg"
              >
                Yes, delete
              </button>
              <button
                onClick={() => setDeletingTemplateId(null)}
                className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Manage Tags Modal                                                   */}
      {/* ------------------------------------------------------------------ */}
      {showManageTags && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowManageTags(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Manage Tags</h2>
              <button onClick={() => setShowManageTags(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {/* Create tag form */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-600 mb-2">New Tag</p>
              {tagFormError && (
                <p className="text-xs text-red-600 mb-2">{tagFormError}</p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                  placeholder="Tag name…"
                  maxLength={50}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-9 h-9 rounded cursor-pointer border border-gray-300 p-0.5"
                  title="Pick colour"
                />
                <button
                  onClick={handleCreateTag}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                >
                  Create
                </button>
              </div>
              <div className="flex gap-1.5 mt-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewTagColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${newTagColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>

            {/* Existing tags */}
            {allTags.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No tags yet.</p>
            )}
            <ul className="space-y-2">
              {allTags.map((tag) => (
                <li key={tag.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100">
                  {editingTag?.id === tag.id ? (
                    <>
                      <input
                        type="color"
                        value={editTagColor}
                        onChange={(e) => setEditTagColor(e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border border-gray-300 p-0.5 flex-shrink-0"
                      />
                      <input
                        type="text"
                        value={editTagName}
                        onChange={(e) => setEditTagName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateTag(tag.id)}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button onClick={() => handleUpdateTag(tag.id)} className="text-xs text-green-600 hover:text-green-800 font-medium">Save</button>
                      <button onClick={() => setEditingTag(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                      <span className="flex-1 text-sm text-gray-700">{tag.name}</span>
                      <button
                        onClick={() => { setEditingTag(tag); setEditTagName(tag.name); setEditTagColor(tag.color); }}
                        className="text-gray-400 hover:text-blue-500 transition-colors p-1"
                        aria-label="Edit tag"
                      >✏️</button>
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        aria-label="Delete tag"
                      >🗑️</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
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

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[70] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          <span>{toast.type === 'success' ? '✅' : '❌'} {toast.message}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
        </div>
      )}
    </div>
  );
}
