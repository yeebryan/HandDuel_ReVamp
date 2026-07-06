import { Pool } from 'pg';

export interface PvCEntry {
  name: string;
  streak: number;
  timestamp: number;
}

/**
 * Tracks best win-streaks vs CPU. Only stores a player's *highest* streak.
 *
 * Persistence strategy:
 *   - If DATABASE_URL is set → use Neon Postgres (durable across redeploys,
 *     spin-downs, and platform restarts).
 *   - Otherwise → fall back to an in-memory map (useful for `npm run dev`
 *     without a DB connection).
 *
 * The table is created on first boot if it doesn't exist.
 */
export class PvCLeaderboard {
  private pool: Pool | null = null;
  private fallback = new Map<string, PvCEntry>();
  private ready: Promise<void>;

  /** Last load/init outcome — surfaced via /pvc/debug for diagnostics */
  lastLoadAt: number | null = null;
  lastLoadError: string | null = null;
  lastSaveAt: number | null = null;
  lastSaveError: string | null = null;

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
      console.log('[PvCLeaderboard] No DATABASE_URL — using in-memory fallback');
      this.lastLoadAt = Date.now();
      return;
    }
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS pvc_leaderboard (
          name        TEXT PRIMARY KEY,
          streak      INTEGER NOT NULL DEFAULT 0,
          timestamp   BIGINT  NOT NULL DEFAULT 0
        )
      `);
      console.log('[PvCLeaderboard] Postgres ready');
      this.lastLoadAt = Date.now();
      this.lastLoadError = null;
    } catch (err) {
      this.lastLoadError = String(err);
      console.warn('[PvCLeaderboard] Postgres init failed:', err);
    }
  }

  async submit(name: string, streak: number): Promise<PvCEntry> {
    const trimmed = name.trim().slice(0, 20) || 'Anon';
    const timestamp = Date.now();

    if (this.pool) {
      try {
        // Upsert: insert or update only if new streak is higher
        await this.pool.query(
          `INSERT INTO pvc_leaderboard (name, streak, timestamp)
           VALUES ($1, $2, $3)
           ON CONFLICT (name) DO UPDATE
             SET streak    = GREATEST(pvc_leaderboard.streak, EXCLUDED.streak),
                 timestamp = CASE
                               WHEN EXCLUDED.streak > pvc_leaderboard.streak
                               THEN EXCLUDED.timestamp
                               ELSE pvc_leaderboard.timestamp
                             END`,
          [trimmed, streak, timestamp],
        );
        this.lastSaveAt = Date.now();
        this.lastSaveError = null;
        const res = await this.pool.query<{ name: string; streak: string; timestamp: string }>(
          'SELECT * FROM pvc_leaderboard WHERE name = $1',
          [trimmed],
        );
        const row = res.rows[0];
        return { name: row.name, streak: Number(row.streak), timestamp: Number(row.timestamp) };
      } catch (err) {
        this.lastSaveError = String(err);
        console.warn('[PvCLeaderboard] Postgres submit failed:', err);
      }
    }

    // In-memory fallback
    const existing = this.fallback.get(trimmed);
    if (!existing || streak > existing.streak) {
      const entry: PvCEntry = { name: trimmed, streak, timestamp };
      this.fallback.set(trimmed, entry);
      this.lastSaveAt = Date.now();
      return entry;
    }
    return existing;
  }

  async getTop(n = 10): Promise<PvCEntry[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query<{ name: string; streak: string; timestamp: string }>(
          'SELECT * FROM pvc_leaderboard ORDER BY streak DESC, timestamp ASC LIMIT $1',
          [n],
        );
        return res.rows.map((r) => ({
          name: r.name,
          streak: Number(r.streak),
          timestamp: Number(r.timestamp),
        }));
      } catch (err) {
        console.warn('[PvCLeaderboard] Postgres getTop failed:', err);
      }
    }
    return [...this.fallback.values()]
      .sort((a, b) => b.streak - a.streak || a.timestamp - b.timestamp)
      .slice(0, n);
  }

  async getDebug() {
    let rowCount: number | null = null;
    let dbError: string | null = null;
    if (this.pool) {
      try {
        const res = await this.pool.query('SELECT COUNT(*) as count FROM pvc_leaderboard');
        rowCount = Number(res.rows[0].count);
      } catch (err) {
        dbError = String(err);
      }
    }
    return {
      mode: this.pool ? 'postgres' : 'in-memory-fallback',
      dbConnected: Boolean(this.pool),
      rowCount,
      dbError,
      lastLoadAt: this.lastLoadAt,
      lastLoadError: this.lastLoadError,
      lastSaveAt: this.lastSaveAt,
      lastSaveError: this.lastSaveError,
    };
  }
}
