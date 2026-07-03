import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { notificationDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

// GET /api/notifications/check
// Returns todos whose reminder time has passed and haven't been notified yet.
// Updates last_notification_sent to prevent duplicates.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const now = getSingaporeNow();
  const todos = notificationDB.getTodosNeedingNotification(session.userId, now.toISOString());

  for (const todo of todos) {
    notificationDB.markNotificationSent(todo.id, now.toISOString());
  }

  return NextResponse.json({ todos });
}
