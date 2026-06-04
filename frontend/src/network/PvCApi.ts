const SERVER_URL = import.meta.env['VITE_SERVER_URL'] || 'http://localhost:3001';

// Long enough to ride out a Render cold start (30–50s)
const REQUEST_TIMEOUT_MS = 60_000;
const QUEUE_KEY = 'handduel.pvc.pending';

function fetchWithTimeout(url: string, init?: RequestInit, ms = REQUEST_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

export interface PvCEntry {
  name: string;
  streak: number;
  timestamp: number;
}

interface PendingSubmission { name: string; streak: number; queuedAt: number; }

function readQueue(): PendingSubmission[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]'); }
  catch { return []; }
}

function writeQueue(items: PendingSubmission[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items)); } catch { /* quota / private mode */ }
}

async function postOne(name: string, streak: number): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${SERVER_URL}/pvc/streak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, streak }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget submission. UI never blocks on this.
 * If the network call fails (cold-start timeout, offline, server down)
 * the submission is queued in localStorage and retried automatically on
 * the next page load via flushQueue().
 */
export function submitStreak(name: string, streak: number): void {
  void (async () => {
    const ok = await postOne(name, streak);
    if (!ok) {
      const queue = readQueue();
      queue.push({ name, streak, queuedAt: Date.now() });
      writeQueue(queue);
      console.warn('[PvCApi] submitStreak deferred to retry queue', { name, streak });
    }
  })();
}

/** Replay any queued submissions. Call once on app boot. */
export async function flushQueue(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;
  const remaining: PendingSubmission[] = [];
  for (const item of queue) {
    const ok = await postOne(item.name, item.streak);
    if (!ok) remaining.push(item);
  }
  writeQueue(remaining);
  if (queue.length !== remaining.length) {
    console.info(`[PvCApi] flushed ${queue.length - remaining.length} queued submission(s)`);
  }
}

export async function fetchTop(): Promise<PvCEntry[]> {
  try {
    const res = await fetchWithTimeout(`${SERVER_URL}/leaderboard/pvc`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as PvCEntry[];
  } catch (err) {
    console.warn('[PvCApi] fetchTop failed', err);
    return [];
  }
}
