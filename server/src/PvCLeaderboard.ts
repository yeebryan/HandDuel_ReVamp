import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

export interface PvCEntry {
  name: string;
  streak: number;
  timestamp: number;
}

/**
 * Tracks best win-streaks vs CPU. Only stores a player's *highest* streak.
 *
 * Persists to disk on every write so the leaderboard survives Render
 * free-tier spin-down/wake cycles. Note: Render's ephemeral disk still
 * wipes on redeploys — for full durability swap this for a real DB.
 */
export class PvCLeaderboard {
  private best = new Map<string, PvCEntry>();
  private filePath: string;

  constructor(filePath = process.env['PVC_DATA_FILE'] ?? './data/pvc-leaderboard.json') {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      if (!existsSync(this.filePath)) return;
      const raw = readFileSync(this.filePath, 'utf8');
      const entries = JSON.parse(raw) as PvCEntry[];
      for (const e of entries) {
        if (e && typeof e.name === 'string' && typeof e.streak === 'number') {
          this.best.set(e.name, e);
        }
      }
      console.log(`[PvCLeaderboard] loaded ${this.best.size} entries from ${this.filePath}`);
    } catch (err) {
      console.warn(`[PvCLeaderboard] failed to load ${this.filePath}:`, err);
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify([...this.best.values()]), 'utf8');
    } catch (err) {
      console.warn(`[PvCLeaderboard] failed to save ${this.filePath}:`, err);
    }
  }

  submit(name: string, streak: number): PvCEntry {
    const trimmed = name.trim().slice(0, 20) || 'Anon';
    const existing = this.best.get(trimmed);
    if (!existing || streak > existing.streak) {
      const entry: PvCEntry = { name: trimmed, streak, timestamp: Date.now() };
      this.best.set(trimmed, entry);
      this.save();
      return entry;
    }
    return existing;
  }

  getTop(n = 10): PvCEntry[] {
    return [...this.best.values()]
      .sort((a, b) => b.streak - a.streak || a.timestamp - b.timestamp)
      .slice(0, n);
  }
}
