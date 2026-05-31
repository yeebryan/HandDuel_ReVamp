export interface PvCEntry {
  name: string;
  streak: number;
  timestamp: number;
}

/**
 * Tracks best win-streaks vs CPU. Only stores a player's *highest* streak.
 */
export class PvCLeaderboard {
  private best = new Map<string, PvCEntry>();

  submit(name: string, streak: number): PvCEntry {
    const trimmed = name.trim().slice(0, 20) || 'Anon';
    const existing = this.best.get(trimmed);
    if (!existing || streak > existing.streak) {
      const entry: PvCEntry = { name: trimmed, streak, timestamp: Date.now() };
      this.best.set(trimmed, entry);
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
