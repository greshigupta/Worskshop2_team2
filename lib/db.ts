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
`);

// Migration: add priority column (safe to run multiple times)
try {
  db.exec(`ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'`);
} catch {
  // Column already exists — ignore
}

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export type Priority = 'high' | 'medium' | 'low';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  description?: string | null;
  completed: boolean;
  due_date?: string | null;
  priority: Priority;
  created_at: string;
  updated_at: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  due_date?: string;
  priority?: Priority;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string;
  completed?: boolean;
  due_date?: string | null;
  priority?: Priority;
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
  created_at: string;
  updated_at: string;
}

function rowToTodo(row: TodoRow): Todo {
  return {
    ...row,
    completed: row.completed === 1,
    priority: (row.priority as Priority) ?? 'medium',
  };
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const stmts = {
  insert: db.prepare<[number, string, string | null, string | null, string, string, string]>(`
    INSERT INTO todos (user_id, title, description, due_date, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  selectAll: db.prepare<[number]>(`
    SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC
  `),
  selectById: db.prepare<[number, number]>(`
    SELECT * FROM todos WHERE id = ? AND user_id = ?
  `),
  updateFull: db.prepare<[string, string | null, number, string | null, string, string, number, number]>(`
    UPDATE todos
    SET title = ?, description = ?, completed = ?, due_date = ?, priority = ?, updated_at = ?
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
    const result = stmts.insert.run(
      userId,
      input.title.trim(),
      input.description?.trim() ?? null,
      input.due_date ?? null,
      priority,
      now,
      now,
    );
    return rowToTodo(
      stmts.selectById.get(result.lastInsertRowid as number, userId) as TodoRow,
    );
  },

  getAll(userId: number): Todo[] {
    const rows = stmts.selectAll.all(userId) as TodoRow[];
    return rows.map(rowToTodo);
  },

  getById(userId: number, id: number): Todo | null {
    const row = stmts.selectById.get(id, userId) as TodoRow | undefined;
    return row ? rowToTodo(row) : null;
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

    stmts.updateFull.run(title, description, completed, due_date, priority, now, id, userId);
    return rowToTodo(stmts.selectById.get(id, userId) as TodoRow);
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
