export interface AppNotification {
  id: string;
  title: string;
  message: string;
  dataset_id: string;
  read: boolean;
  created_at: string;
}

const KEY = "synthcs_notifications";
const EVENT = "synthcs-notifications-updated";

export function getNotifications(): AppNotification[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); }
  catch { return []; }
}

export function pushNotification(n: Omit<AppNotification, "id" | "read" | "created_at">) {
  const list = getNotifications();
  const next: AppNotification = {
    ...n,
    id: `notif_${Date.now()}`,
    read: false,
    created_at: new Date().toISOString(),
  };
  localStorage.setItem(KEY, JSON.stringify([next, ...list].slice(0, 30)));
  window.dispatchEvent(new Event(EVENT));
}

export function markRead(id: string) {
  const list = getNotifications().map((n) => n.id === id ? { ...n, read: true } : n);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function markAllRead() {
  const list = getNotifications().map((n) => ({ ...n, read: true }));
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function clearNotifications() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeNotifications(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
