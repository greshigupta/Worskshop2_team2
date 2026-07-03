import { DatabaseSync } from 'node:sqlite'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'todos.db')

let _db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (_db) return _db
  _db = new DatabaseSync(DB_PATH)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      title              TEXT    NOT NULL,
      description        TEXT,
      completed          INTEGER NOT NULL DEFAULT 0,
      due_date           TEXT,
      priority           TEXT    NOT NULL DEFAULT 'medium'
                           CHECK(priority IN ('high','medium','low')),
      is_recurring       INTEGER NOT NULL DEFAULT 0,
      recurrence_pattern TEXT
                           CHECK(recurrence_pattern IN ('daily','weekly','monthly','yearly')),
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
    CREATE INDEX IF NOT EXISTS idx_todos_due_date  ON todos(due_date);
  `)
  // Migration: add description to existing databases
  try { _db.exec(`ALTER TABLE todos ADD COLUMN description TEXT`) } catch { /* already exists */ }
  return _db
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Priority         = 'high' | 'medium' | 'low'
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly'

export const VALID_PRIORITIES: Priority[]          = ['high', 'medium', 'low']
export const VALID_PATTERNS:   RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly']

export const PRIORITY_ORDER: Record<Priority, number> = { high: 1, medium: 2, low: 3 }

export interface Todo {
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

// node:sqlite returns rows as plain objects; StatementSync.run() returns { changes, lastInsertRowid }
type RunResult = { changes: number; lastInsertRowid: number | bigint }

// Raw SQLite row (booleans stored as 0/1)
interface TodoRow {
  id:                 number
  title:              string
  description:        string | null
  completed:          number
  due_date:           string | null
  priority:           Priority
  is_recurring:       number
  recurrence_pattern: RecurrencePattern | null
  created_at:         string
  updated_at:         string
}

function rowToTodo(row: TodoRow): Todo {
  return {
    ...row,
    completed:    row.completed    === 1,
    is_recurring: row.is_recurring === 1,
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const todoDB = {
  getAll(): Todo[] {
    const db   = getDb()
    const rows = db.prepare('SELECT * FROM todos ORDER BY created_at DESC').all() as unknown as TodoRow[]
    return rows.map(rowToTodo)
  },

  getById(id: number): Todo | null {
    const db  = getDb()
    const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as TodoRow | undefined
    return row ? rowToTodo(row) : null
  },

  create(input: {
    title:              string
    description?:       string | null
    priority?:          Priority
    due_date?:          string | null
    is_recurring?:      boolean
    recurrence_pattern?: RecurrencePattern | null
  }): Todo {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO todos (title, description, priority, due_date, is_recurring, recurrence_pattern, completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(
      input.title,
      input.description        ?? null,
      input.priority           ?? 'medium',
      input.due_date           ?? null,
      input.is_recurring       ?  1 : 0,
      input.recurrence_pattern ?? null,
    ) as RunResult
    return this.getById(Number(result.lastInsertRowid))!
  },

  update(id: number, input: {
    title?:              string
    description?:        string | null
    completed?:          boolean
    priority?:           Priority
    due_date?:           string | null
    is_recurring?:       boolean
    recurrence_pattern?: RecurrencePattern | null
  }): Todo | null {
    const db       = getDb()
    const existing = this.getById(id)
    if (!existing) return null

    const next = {
      title:              input.title              ?? existing.title,
      description:        (('description'       in input ? input.description       : existing.description) ?? null),
      completed:          input.completed          !== undefined ? (input.completed ? 1 : 0) : (existing.completed ? 1 : 0),
      priority:           input.priority           ?? existing.priority,
      due_date:           (('due_date'           in input ? input.due_date           : existing.due_date) ?? null),
      is_recurring:       input.is_recurring       !== undefined ? (input.is_recurring ? 1 : 0) : (existing.is_recurring ? 1 : 0),
      recurrence_pattern: (('recurrence_pattern' in input ? input.recurrence_pattern : existing.recurrence_pattern) ?? null),
    }

    db.prepare(`
      UPDATE todos
         SET title = ?, description = ?, completed = ?, priority = ?, due_date = ?,
             is_recurring = ?, recurrence_pattern = ?, updated_at = datetime('now')
       WHERE id = ?
    `).run(
      next.title, next.description, next.completed, next.priority, next.due_date,
      next.is_recurring, next.recurrence_pattern, id,
    )

    return this.getById(id)
  },

  delete(id: number): boolean {
    const db     = getDb()
    const result = db.prepare('DELETE FROM todos WHERE id = ?').run(id)
    return result.changes > 0
  },
}
