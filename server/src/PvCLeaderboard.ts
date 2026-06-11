import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { put, list } from '@vercel/blob';

export interface PvCEntry {
  name: string;
  streak: number;
  timestamp: number;
}

const BLOB_PATHNAME = 'pvc-leaderboard.json';

/**
 * Tracks best win-streaks vs CPU. Only stores a player's *highest* streak.
 *
 * Persistence strategy:
 *   - If BLOB_READ_WRITE_TOKEN is set → use Vercel Blob (durable across redeploys,
 *     spin-downs, and platform restarts).
 *   - Otherwise → fall back to a local JSON file (useful for `npm run dev`).
 *
 * In-memory map is the runtime source of truth; writes are mirrored to the
 * backing store so the next process boot can hydrate from it.
 */
export class PvCLeaderboard {
  private best = new Map<string, PvCEntry>();
  private filePath: string;
  private blobToken: string | undefined;
  private ready: Promise<void>;

  constructor(filePath = process.env['PVC_DATA_FILE'] ?? './data/pvc-leaderboard.json') {
    this.filePath = filePath;
    this.blobToken = process.env['BLOB_READ_WRITE_TOKEN'];
    this.ready = this.load();
  }

  /** Resolves when the initial load (from Blob or file) is complete. */
  whenReady(): Promise<void> { return this.ready; }

  private async load(): Promise<void> {
    if (this.blobToken) {
      try {
        const { blobs } = await list({ prefix: BLOB_PATHNAME, token: this.blobToken });
        const match = blobs.find((b) => b.pathname === BLOB_PATHNAME);
        if (!match) {
          console.log(`[PvCLeaderboard] no existing blob at ${BLOB_PATHNAME}, starting fresh`);
          return;
        }
        const res = await fetch(match.url);
        const entries = (await res.json()) as PvCEntry[];
        for (const e of entries) {
          if (e && typeof e.name === 'string' && typeof e.streak === 'number') {
            this.best.set(e.name, e);
          }
        }
        console.log(`[PvCLeaderboard] loaded ${this.best.size} entries from Blob`);
        return;
      } catch (err) {
        console.warn('[PvCLeaderboard] Blob load failed, falling back to file:', err);
      }
    }

    // File fallback
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

  /** Last save attempt outcome — exposed via debug endpoint */
  lastSaveAt: number | null = null;
  lastSaveError: string | null = null;

  private async save(): Promise<void> {
    const json = JSON.stringify([...this.best.values()]);

    if (this.blobToken) {
      try {
        await put(BLOB_PATHNAME, json, {
          access: 'public',
          token: this.blobToken,
          contentType: 'application/json',
          allowOverwrite: true,
          addRandomSuffix: false,
        });
        this.lastSaveAt = Date.now();
        this.lastSaveError = null;
      } catch (err) {
        this.lastSaveError = String(err);
        console.warn('[PvCLeaderboard] Blob save failed:', err);
      }
      return;
    }

    // File fallback
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, json, 'utf8');
      this.lastSaveAt = Date.now();
      this.lastSaveError = null;
    } catch (err) {
      this.lastSaveError = String(err);
      console.warn(`[PvCLeaderboard] failed to save ${this.filePath}:`, err);
    }
  }

  async submit(name: string, streak: number): Promise<PvCEntry> {
    const trimmed = name.trim().slice(0, 20) || 'Anon';
    const existing = this.best.get(trimmed);
    if (!existing || streak > existing.streak) {
      const entry: PvCEntry = { name: trimmed, streak, timestamp: Date.now() };
      this.best.set(trimmed, entry);
      // Await the write so we know it landed before responding to client
      await this.save();
      return entry;
    }
    return existing;
  }

  /** Diagnostics for the /pvc/debug endpoint */
  getDebug() {
    return {
      blobTokenPresent: Boolean(this.blobToken),
      filePath: this.filePath,
      inMemoryCount: this.best.size,
      lastSaveAt: this.lastSaveAt,
      lastSaveError: this.lastSaveError,
    };
  }

  getTop(n = 10): PvCEntry[] {
    return [...this.best.values()]
      .sort((a, b) => b.streak - a.streak || a.timestamp - b.timestamp)
      .slice(0, n);
  }
}
