/**
 * lib/timezone.ts — Singapore timezone helpers
 * All date/time operations in the app must use these utilities (per copilot-instructions.md).
 * Singapore is UTC+8 with no DST.
 */

export const SINGAPORE_TZ = 'Asia/Singapore'

/** Current time as a Date object (wall-clock correct, timezone-aware) */
export function getSingaporeNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: SINGAPORE_TZ }))
}

/**
 * Returns true if the given ISO datetime string is at least 1 minute
 * in the future (per Singapore wall-clock time).
 */
export function isValidFutureDate(dueDateStr: string): boolean {
  const due = new Date(dueDateStr)
  return due.getTime() > Date.now() + 60_000
}

/** Returns true if the given ISO datetime string is in the past. */
export function isPastDue(dueDateStr: string): boolean {
  return new Date(dueDateStr).getTime() < Date.now()
}

/**
 * Format a date relative to now for display (e.g. "Due in 2h", "3d overdue").
 */
export function formatRelativeDate(dueDateStr: string): { text: string; colorClass: string } {
  const diff = new Date(dueDateStr).getTime() - Date.now()
  const m    = diff / 60_000

  if (diff < 0) {
    const o = Math.abs(m)
    if (o < 60)   return { text: `${Math.round(o)}m overdue`,       colorClass: 'text-red-600' }
    if (o < 1440) return { text: `${Math.round(o / 60)}h overdue`,  colorClass: 'text-red-600' }
    return           { text: `${Math.round(o / 1440)}d overdue`,    colorClass: 'text-red-600' }
  }
  if (m < 60)    return { text: `Due in ${Math.round(m)}m`,         colorClass: 'text-red-500' }
  if (m < 1440)  return { text: `Due in ${Math.round(m / 60)}h`,    colorClass: 'text-orange-500' }
  if (m < 10080) return { text: `Due in ${Math.round(m / 1440)}d`,  colorClass: 'text-yellow-600' }
  return           { text: new Date(dueDateStr).toLocaleString('en-SG', { timeZone: SINGAPORE_TZ }), colorClass: 'text-blue-500' }
}

/** Minimum value for a datetime-local input: now + 1 min */
export function minDatetimeLocal(): string {
  return new Date(Date.now() + 61_000).toISOString().slice(0, 16)
}
