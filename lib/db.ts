import Database from 'better-sqlite3';
import path from 'path';
import { formatSingaporeDate } from './timezone';

// ---------------------------------------------------------------------------
// Database initialization
// ---------------------------------------------------------------------------

const DB_PATH = path.join(process.cwd(), 'todos.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS todos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    description TEXT,
    completed   INTEGER NOT NULL DEFAULT 0,
    due_date    TEXT,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
  CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

  CREATE TABLE IF NOT EXISTS subtasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id    INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    completed  INTEGER NOT NULL DEFAULT 0,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);
`);

// Migration: add priority column (safe to run multiple times)
try {
  db.exec(`ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'`);
} catch {
  // Column already exists — ignore
}

// Migration: add recurrence columns (safe to run multiple times)
try {
  db.exec(`ALTER TABLE todos ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0`);
} catch {
  // Column already exists — ignore
}
try {
  db.exec(`ALTER TABLE todos ADD COLUMN recurrence_pattern TEXT`);
} catch {
  // Column already exists — ignore
}

// Migration: add reminder columns (safe to run multiple times)
try {
  db.exec(`ALTER TABLE todos ADD COLUMN reminder_minutes INTEGER`);
} catch {
  // Column already exists — ignore
}
try {
  db.exec(`ALTER TABLE todos ADD COLUMN last_notification_sent TEXT`);
} catch {
  // Column already exists — ignore
}

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
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
}

// ---------------------------------------------------------------------------
// Subtask interfaces
// ---------------------------------------------------------------------------

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface CreateSubtaskInput {
  title: string;
}

export interface UpdateSubtaskInput {
  title?: string;
  completed?: boolean;
}

interface SubtaskRow {
  id: number;
  todo_id: number;
  title: string;
  completed: number;
  position: number;
  created_at: string;
}

function rowToSubtask(row: SubtaskRow): Subtask {
  return { ...row, completed: row.completed === 1 };
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  due_date?: string;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string;
  completed?: boolean;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}

// Raw row returned by better-sqlite3 (completed stored as 0/1)
interface TodoRow {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  completed: number;
  due_date: string | null;
  priority: string;
  is_recurring: number;
  recurrence_pattern: string | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTodo(row: TodoRow): Todo {
  return {
    ...row,
    completed: row.completed === 1,
    priority: (row.priority as Priority) ?? 'medium',
    is_recurring: row.is_recurring === 1,
    recurrence_pattern: (row.recurrence_pattern as RecurrencePattern | null) ?? null,
    reminder_minutes: row.reminder_minutes ?? null,
    last_notification_sent: row.last_notification_sent ?? null,
    subtasks: [],
  };
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const subtaskStmts = {
  selectAllForUser: db.prepare<[number]>(`
    SELECT s.* FROM subtasks s
    JOIN todos t ON t.id = s.todo_id
    WHERE t.user_id = ?
    ORDER BY s.todo_id, s.position ASC
  `),
  selectForTodo: db.prepare<[number, number]>(`
    SELECT s.* FROM subtasks s
    JOIN todos t ON t.id = s.todo_id
    WHERE s.todo_id = ? AND t.user_id = ?
    ORDER BY s.position ASC
  `),
  selectById: db.prepare<[number]>(`
    SELECT * FROM subtasks WHERE id = ?
  `),
  maxPosition: db.prepare<[number]>(`
    SELECT COALESCE(MAX(position), 0) FROM subtasks WHERE todo_id = ?
  `),
  insert: db.prepare<[number, string, number, string]>(`
    INSERT INTO subtasks (todo_id, title, position, created_at) VALUES (?, ?, ?, ?)
  `),
  update: db.prepare<[string, number, number]>(`
    UPDATE subtasks SET title = ?, completed = ? WHERE id = ?
  `),
  delete: db.prepare<[number]>(`
    DELETE FROM subtasks WHERE id = ?
  `),
};

export const subtaskDB = {
  create(todoId: number, userId: number, input: CreateSubtaskInput): Subtask | null {
    // Verify parent todo belongs to user
    const todo = stmts.selectById.get(todoId, userId) as TodoRow | undefined;
    if (!todo) return null;
    const now = formatSingaporeDate(new Date());
    const maxPos = (subtaskStmts.maxPosition.pluck().get(todoId) as number | null) ?? 0;
    const result = subtaskStmts.insert.run(todoId, input.title.trim(), maxPos + 1, now);
    return rowToSubtask(subtaskStmts.selectById.get(result.lastInsertRowid as number) as SubtaskRow);
  },

  getForTodo(todoId: number, userId: number): Subtask[] {
    const rows = subtaskStmts.selectForTodo.all(todoId, userId) as SubtaskRow[];
    return rows.map(rowToSubtask);
  },

  update(id: number, todoId: number, userId: number, input: UpdateSubtaskInput): Subtask | null {
    // Verify parent todo ownership
    const parentTodo = stmts.selectById.get(todoId, userId) as TodoRow | undefined;
    if (!parentTodo) return null;
    const existing = subtaskStmts.selectById.get(id) as SubtaskRow | undefined;
    if (!existing || existing.todo_id !== todoId) return null;
    const title = input.title !== undefined ? input.title.trim() : existing.title;
    const completed = input.completed !== undefined ? (input.completed ? 1 : 0) : existing.completed;
    subtaskStmts.update.run(title, completed, id);
    return rowToSubtask(subtaskStmts.selectById.get(id) as SubtaskRow);
  },

  delete(id: number, todoId: number, userId: number): boolean {
    const parentTodo = stmts.selectById.get(todoId, userId) as TodoRow | undefined;
    if (!parentTodo) return false;
    const existing = subtaskStmts.selectById.get(id) as SubtaskRow | undefined;
    if (!existing || existing.todo_id !== todoId) return false;
    subtaskStmts.delete.run(id);
    return true;
  },
};

const stmts = {
  insert: db.prepare<[number, string, string | null, string | null, string, number, string | null, number | null, string, string]>(`
    INSERT INTO todos (user_id, title, description, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  selectAll: db.prepare<[number]>(`
    SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC
  `),
  selectById: db.prepare<[number, number]>(`
    SELECT * FROM todos WHERE id = ? AND user_id = ?
  `),
  updateFull: db.prepare<[string, string | null, number, string | null, string, number, string | null, number | null, string, number, number]>(`
    UPDATE todos
    SET title = ?, description = ?, completed = ?, due_date = ?, priority = ?,
        is_recurring = ?, recurrence_pattern = ?, reminder_minutes = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `),
  delete: db.prepare<[number, number]>(`
    DELETE FROM todos WHERE id = ? AND user_id = ?
  `),
};

// ---------------------------------------------------------------------------
// todoDB — CRUD methods (all synchronous)
// ---------------------------------------------------------------------------

export const todoDB = {
  create(userId: number, input: CreateTodoInput): Todo {
    const now = formatSingaporeDate(new Date());
    const priority: Priority = input.priority ?? 'medium';
    const is_recurring = input.is_recurring ? 1 : 0;
    const recurrence_pattern = input.recurrence_pattern ?? null;
    const reminder_minutes = input.reminder_minutes ?? null;
    const result = stmts.insert.run(
      userId,
      input.title.trim(),
      input.description?.trim() ?? null,
      input.due_date ?? null,
      priority,
      is_recurring,
      recurrence_pattern,
      reminder_minutes,
      now,
      now,
    );
    const todo = rowToTodo(
      stmts.selectById.get(result.lastInsertRowid as number, userId) as TodoRow,
    );
    todo.subtasks = subtaskDB.getForTodo(todo.id, userId);
    return todo;
  },

  getAll(userId: number): Todo[] {
    const rows = stmts.selectAll.all(userId) as TodoRow[];
    const todos = rows.map(rowToTodo);
    // Batch-fetch all subtasks for this user and attach
    const allSubtaskRows = subtaskStmts.selectAllForUser.all(userId) as SubtaskRow[];
    const subtasksByTodoId = new Map<number, Subtask[]>();
    for (const row of allSubtaskRows) {
      const subtask = rowToSubtask(row);
      const arr = subtasksByTodoId.get(row.todo_id) ?? [];
      arr.push(subtask);
      subtasksByTodoId.set(row.todo_id, arr);
    }
    for (const todo of todos) {
      todo.subtasks = subtasksByTodoId.get(todo.id) ?? [];
    }
    return todos;
  },

  getById(userId: number, id: number): Todo | null {
    const row = stmts.selectById.get(id, userId) as TodoRow | undefined;
    if (!row) return null;
    const todo = rowToTodo(row);
    todo.subtasks = subtaskDB.getForTodo(todo.id, userId);
    return todo;
  },

  update(userId: number, id: number, input: UpdateTodoInput): Todo | null {
    const existing = todoDB.getById(userId, id);
    if (!existing) return null;

    const now = formatSingaporeDate(new Date());
    const title = input.title !== undefined ? input.title.trim() : existing.title;
    const description =
      input.description !== undefined ? input.description.trim() : (existing.description ?? null);
    const completed = input.completed !== undefined ? (input.completed ? 1 : 0) : (existing.completed ? 1 : 0);
    const due_date = input.due_date !== undefined ? (input.due_date ?? null) : (existing.due_date ?? null);
    const priority: Priority = input.priority ?? existing.priority;
    const is_recurring = input.is_recurring !== undefined ? (input.is_recurring ? 1 : 0) : (existing.is_recurring ? 1 : 0);
    const recurrence_pattern =
      input.recurrence_pattern !== undefined ? (input.recurrence_pattern ?? null) : existing.recurrence_pattern;
    // Clear reminder if due_date is being removed
    const effective_due_date = input.due_date !== undefined ? (input.due_date ?? null) : (existing.due_date ?? null);
    const reminder_minutes =
      input.reminder_minutes !== undefined
        ? (input.reminder_minutes ?? null)
        : effective_due_date === null
          ? null
          : (existing.reminder_minutes ?? null);

    stmts.updateFull.run(title, description, completed, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes, now, id, userId);
    const updated = rowToTodo(stmts.selectById.get(id, userId) as TodoRow);
    updated.subtasks = subtaskDB.getForTodo(id, userId);
    return updated;
  },

  delete(userId: number, id: number): boolean {
    const result = stmts.delete.run(id, userId);
    return result.changes > 0;
  },
};

// ---------------------------------------------------------------------------
// userDB — minimal user helpers (needed for session bootstrap in dev)
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  username: string;
  created_at: string;
}

interface UserRow {
  id: number;
  username: string;
  created_at: string;
}

const userStmts = {
  insert: db.prepare<[string, string]>(`
    INSERT OR IGNORE INTO users (username, created_at) VALUES (?, ?)
  `),
  selectByUsername: db.prepare<[string]>(`
    SELECT * FROM users WHERE username = ?
  `),
};

export const userDB = {
  findOrCreate(username: string): User {
    const now = formatSingaporeDate(new Date());
    userStmts.insert.run(username, now);
    return userStmts.selectByUsername.get(username) as UserRow;
  },
  findByUsername(username: string): User | null {
    const row = userStmts.selectByUsername.get(username) as UserRow | undefined;
    return row ?? null;
  },
};

// ---------------------------------------------------------------------------
// notificationDB — reminder / notification helpers
// ---------------------------------------------------------------------------

const notifStmts = {
  getTodosNeedingNotification: db.prepare<[number, string, string]>(`
    SELECT * FROM todos
    WHERE user_id = ?
      AND completed = 0
      AND reminder_minutes IS NOT NULL
      AND due_date IS NOT NULL
      AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= ?
      AND (last_notification_sent IS NULL
           OR datetime(last_notification_sent, '+' || reminder_minutes || ' minutes') <= ?)
  `),
  markNotificationSent: db.prepare<[string, number]>(`
    UPDATE todos SET last_notification_sent = ? WHERE id = ?
  `),
};

export const notificationDB = {
  getTodosNeedingNotification(userId: number, nowIso: string): Todo[] {
    const rows = notifStmts.getTodosNeedingNotification.all(userId, nowIso, nowIso) as TodoRow[];
    return rows.map(rowToTodo);
  },
  markNotificationSent(todoId: number, sentAt: string): void {
    notifStmts.markNotificationSent.run(sentAt, todoId);
  },
};
