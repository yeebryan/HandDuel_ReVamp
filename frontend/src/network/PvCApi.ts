const SERVER_URL = import.meta.env['VITE_SERVER_URL'] ?? 'http://localhost:3001';

export interface PvCEntry {
  name: string;
  streak: number;
  timestamp: number;
}

export async function submitStreak(name: string, streak: number): Promise<PvCEntry[]> {
  try {
    const res = await fetch(`${SERVER_URL}/pvc/streak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, streak }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.top as PvCEntry[]) ?? [];
  } catch (err) {
    console.warn('[PvCApi] submitStreak failed', err);
    return [];
  }
}

export async function fetchTop(): Promise<PvCEntry[]> {
  try {
    const res = await fetch(`${SERVER_URL}/leaderboard/pvc`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as PvCEntry[];
  } catch (err) {
    console.warn('[PvCApi] fetchTop failed', err);
    return [];
  }
}
