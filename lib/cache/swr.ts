type Entry<T> = { data: T; savedAt: number };

const memory = new Map<string, Entry<unknown>>();

function storageKey(key: string) {
  return `fobc-cache:${key}`;
}

export function readStale<T>(key: string): T | null {
  const hit = memory.get(key);
  if (hit) return hit.data as T;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    memory.set(key, parsed);
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T) {
  const entry = { data, savedAt: Date.now() };
  memory.set(key, entry);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // The feed still stays in memory for this visit.
  }
}
