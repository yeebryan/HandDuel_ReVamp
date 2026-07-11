import { Pool } from 'pg';

export interface OnlineEntry {
  name: string;
  consecutiveWins: number;
  bestStreak: number;
  totalWins: number;
}

/**
 * Persists PvP Online match results to Neon Postgres.
 * Falls back to in-memory if DATABASE_URL is not set (local dev).
 *
 * Schema: one row per player name.
 * - consecutiveWins: current live streak, reset to 0 on loss
 * - bestStreak: highest consecutiveWins ever reached
 * - totalWins: all-time win count
 */
export class OnlineLeaderboard {
  private pool: Pool | null = null;
  private fallback = new Map<string, OnlineEntry>();
  private ready: Promise<void>;

  constructor() {
    const dbUrl = process.env['DATABASE_URL'];
    if (dbUrl) {
      this.pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    }
    this.ready = this.init();
  }

  whenReady(): Promise<void> { return this.ready; }

  private async init(): Promise<void> {
    if (!this.pool) {
      console.log('[OnlineLeaderboard] No DATABASE_URL — using in-memory fallback');
      return;
    }
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS online_leaderboard (
          name              TEXT    PRIMARY KEY,
          consecutive_wins  INTEGER NOT NULL DEFAULT 0,
          best_streak       INTEGER NOT NULL DEFAULT 0,
          total_wins        INTEGER NOT NULL DEFAULT 0
        )
      `);
      console.log('[OnlineLeaderboard] Postgres ready');
    } catch (err) {
      console.warn('[OnlineLeaderboard] Postgres init failed:', err);
    }
  }

  async upsert(name: string): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO online_leaderboard (name, consecutive_wins, best_streak, total_wins)
           VALUES ($1, 0, 0, 0)
           ON CONFLICT (name) DO NOTHING`,
          [name],
        );
      } catch (err) {
        console.warn('[OnlineLeaderboard] upsert failed:', err);
      }
      return;
    }
    if (!this.fallback.has(name)) {
      this.fallback.set(name, { name, consecutiveWins: 0, bestStreak: 0, totalWins: 0 });
    }
  }

  async recordWin(name: string): Promise<number> {
    if (this.pool) {
      try {
        const res = await this.pool.query<{ consecutive_wins: string }>(
          `INSERT INTO online_leaderboard (name, consecutive_wins, best_streak, total_wins)
           VALUES ($1, 1, 1, 1)
           ON CONFLICT (name) DO UPDATE
             SET consecutive_wins = online_leaderboard.consecutive_wins + 1,
                 best_streak      = GREATEST(online_leaderboard.best_streak,
                                             online_leaderboard.consecutive_wins + 1),
                 total_wins       = online_leaderboard.total_wins + 1
           RETURNING consecutive_wins`,
          [name],
        );
        return Number(res.rows[0].consecutive_wins);
      } catch (err) {
        console.warn('[OnlineLeaderboard] recordWin failed:', err);
        return 0;
      }
    }
    await this.upsert(name);
    const entry = this.fallback.get(name)!;
    entry.consecutiveWins++;
    entry.totalWins++;
    if (entry.consecutiveWins > entry.bestStreak) entry.bestStreak = entry.consecutiveWins;
    return entry.consecutiveWins;
  }

  async resetStreak(name: string): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE online_leaderboard SET consecutive_wins = 0 WHERE name = $1`,
          [name],
        );
      } catch (err) {
        console.warn('[OnlineLeaderboard] resetStreak failed:', err);
      }
      return;
    }
    const entry = this.fallback.get(name);
    if (entry) entry.consecutiveWins = 0;
  }

  async getStreak(name: string): Promise<number> {
    if (this.pool) {
      try {
        const res = await this.pool.query<{ consecutive_wins: string }>(
          `SELECT consecutive_wins FROM online_leaderboard WHERE name = $1`,
          [name],
        );
        return res.rows.length ? Number(res.rows[0].consecutive_wins) : 0;
      } catch (err) {
        console.warn('[OnlineLeaderboard] getStreak failed:', err);
        return 0;
      }
    }
    return this.fallback.get(name)?.consecutiveWins ?? 0;
  }

  async getTop(n = 20): Promise<OnlineEntry[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query<{
          name: string;
          consecutive_wins: string;
          best_streak: string;
          total_wins: string;
        }>(
          `SELECT name, consecutive_wins, best_streak, total_wins
           FROM online_leaderboard
           WHERE best_streak > 0 OR consecutive_wins > 0
           ORDER BY consecutive_wins DESC, best_streak DESC
           LIMIT $1`,
          [n],
        );
        return res.rows.map((r) => ({
          name: r.name,
          consecutiveWins: Number(r.consecutive_wins),
          bestStreak: Number(r.best_streak),
          totalWins: Number(r.total_wins),
        }));
      } catch (err) {
        console.warn('[OnlineLeaderboard] getTop failed:', err);
        return [];
      }
    }
    return [...this.fallback.values()]
      .filter((e) => e.bestStreak > 0 || e.consecutiveWins > 0)
      .sort((a, b) => b.consecutiveWins - a.consecutiveWins || b.bestStreak - a.bestStreak)
      .slice(0, n);
  }
}
