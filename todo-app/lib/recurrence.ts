import type { RecurrencePattern } from './db'

/**
 * Add one unit of the recurrence pattern to a due-date string.
 * Input/output format: "YYYY-MM-DDTHH:mm" (Singapore local time).
 * Uses plain JS Date arithmetic — JS setMonth() naturally handles
 * month-end roll-over (e.g. Jan 31 → Mar 3 in a 28-day February).
 */
export function calculateNextDueDate(
  currentDueDateStr: string,
  pattern: RecurrencePattern,
): string {
  // Parse as UTC-offset-free; the stored string already represents SGT local time
  const date = new Date(currentDueDateStr)

  switch (pattern) {
    case 'daily':
      date.setDate(date.getDate() + 1)
      break
    case 'weekly':
      date.setDate(date.getDate() + 7)
      break
    case 'monthly':
      date.setMonth(date.getMonth() + 1)
      break
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1)
      break
  }

  // Return in "YYYY-MM-DDTHH:mm" format (same as HTML datetime-local)
  return date.toISOString().slice(0, 16)
}
