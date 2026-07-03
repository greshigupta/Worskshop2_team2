'use client';

import { useState, useEffect } from 'react';

export interface ReminderTodo {
  id: number;
  title: string;
  due_date: string;
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const isSupported = typeof window !== 'undefined' && 'Notification' in window;
    setSupported(isSupported);
    if (isSupported) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!supported) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const startPolling = () => {
    const intervalId = setInterval(async () => {
      if (!supported || Notification.permission !== 'granted') return;
      try {
        const res = await fetch('/api/notifications/check');
        if (!res.ok) return;
        const data: { todos: ReminderTodo[] } = await res.json();
        for (const todo of data.todos ?? []) {
          new Notification('Todo Due Soon', {
            body: `${todo.title} — due ${new Date(todo.due_date).toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore' })}`,
            icon: '/favicon.ico',
          });
        }
      } catch {
        // silently fail — retry on next poll
      }
    }, 30_000);

    return intervalId;
  };

  return { permission, supported, requestPermission, startPolling };
}
