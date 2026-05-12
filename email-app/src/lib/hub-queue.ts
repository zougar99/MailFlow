/** Liste locale (navigateur), clé séparée du studio PlumeFlux. */

export type HubQueueItem = {
  id: string;
  department: string;
  title: string;
  preview: string;
  createdAt: string;
};

const KEY = "email-control-hub-queue-v1";

export function loadHubQueue(): HubQueueItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as HubQueueItem[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function saveHubQueue(items: HubQueueItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 80)));
  } catch {
    /* quota */
  }
}

export function pushHubQueue(
  item: Omit<HubQueueItem, "id" | "createdAt">
): HubQueueItem {
  const full: HubQueueItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  const q = loadHubQueue();
  q.unshift(full);
  saveHubQueue(q);
  return full;
}

export function removeHubQueueItem(id: string): void {
  saveHubQueue(loadHubQueue().filter((x) => x.id !== id));
}
