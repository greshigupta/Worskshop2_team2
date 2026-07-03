import type { RecurrencePattern } from './db';

/**
 * Given the current due date of a recurring todo, returns the ISO string of
 * the next due date based on the recurrence pattern.
 *
 * Note: monthly recurrence on the 31st may roll over to the 1st/2nd of the
 * following month when the target month has fewer days — this is accepted
 * behaviour consistent with JavaScript's Date.setMonth semantics.
 */
export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern,
): string {
  const date = new Date(currentDueDate);

  switch (pattern) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return date.toISOString();
}
