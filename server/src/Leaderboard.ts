export interface LeaderboardEntry {
  name: string;
  consecutiveWins: number;
  bestStreak: number;
  totalWins: number;
}

export class Leaderboard {
  private players = new Map<string, LeaderboardEntry>();

  upsert(name: string): void {
    if (!this.players.has(name)) {
      this.players.set(name, { name, consecutiveWins: 0, bestStreak: 0, totalWins: 0 });
    }
  }

  recordWin(name: string): void {
    this.upsert(name);
    const entry = this.players.get(name)!;
    entry.consecutiveWins++;
    entry.totalWins++;
    if (entry.consecutiveWins > entry.bestStreak) {
      entry.bestStreak = entry.consecutiveWins;
    }
  }

  resetStreak(name: string): void {
    const entry = this.players.get(name);
    if (entry) entry.consecutiveWins = 0;
  }

  getTop(n = 10): LeaderboardEntry[] {
    return [...this.players.values()]
      .sort((a, b) => b.consecutiveWins - a.consecutiveWins || b.bestStreak - a.bestStreak)
      .slice(0, n);
  }

  getStreak(name: string): number {
    return this.players.get(name)?.consecutiveWins ?? 0;
  }
}
