const SINGAPORE_TZ = 'Asia/Singapore';

/**
 * Returns the current time as a Date object (adjusted for Singapore timezone context).
 * Use this instead of `new Date()` throughout the app.
 */
export function getSingaporeNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: SINGAPORE_TZ }));
}

/**
 * Formats a Date as an ISO string in Singapore timezone.
 * e.g. "2025-12-01T10:00:00+08:00"
 */
export function formatSingaporeDate(date: Date): string {
  const offset = '+08:00';
  const pad = (n: number) => String(n).padStart(2, '0');

  const sgDate = new Date(date.toLocaleString('en-US', { timeZone: SINGAPORE_TZ }));
  const year = sgDate.getFullYear();
  const month = pad(sgDate.getMonth() + 1);
  const day = pad(sgDate.getDate());
  const hours = pad(sgDate.getHours());
  const minutes = pad(sgDate.getMinutes());
  const seconds = pad(sgDate.getSeconds());

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
}

/**
 * Returns true if the provided ISO date string is at least 1 minute in the future
 * relative to Singapore time.
 */
export function isFutureDate(isoString: string): boolean {
  const now = getSingaporeNow();
  const due = new Date(isoString);
  return due.getTime() > now.getTime() + 60_000;
}
