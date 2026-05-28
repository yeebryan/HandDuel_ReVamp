import { io, type Socket } from 'socket.io-client';
import type { Gesture, MatchedEvent, RevealEvent, MatchOverEvent, LeaderboardEntry } from '../types.js';

const SERVER_URL = import.meta.env['VITE_SERVER_URL'] ?? 'http://localhost:3001';

// Keep types for documentation; use `any` at the socket boundary to avoid
// template-literal event name conflicts with socket.io's strict generic types.
export interface ServerEvents {
  'comp:matched':               MatchedEvent;
  'comp:waiting':               Record<string, never>;
  'comp:countdown':             { value: number };
  'comp:show':                  Record<string, never>;
  'comp:reveal':                RevealEvent;
  'comp:match_over':            MatchOverEvent;
  'comp:leaderboard':           { entries: LeaderboardEntry[] };
  'comp:opponent_disconnected': Record<string, never>;
  'casual:matched':             MatchedEvent;
  'casual:waiting':             Record<string, never>;
  'casual:countdown':           { value: number };
  'casual:show':                Record<string, never>;
  'casual:reveal':              RevealEvent;
  'casual:opponent_disconnected': Record<string, never>;
}

export interface ClientEvents {
  'comp:join':      { name: string };
  'comp:gesture':   { roomId: string; gesture: Gesture };
  'comp:leave':     Record<string, never>;
  'casual:join':    { name: string };
  'casual:gesture': { roomId: string; gesture: Gesture };
  'casual:leave':   Record<string, never>;
}

export class SocketClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private socket: Socket<any, any> | null = null;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(SERVER_URL, {
        transports: ['websocket'],
        reconnectionAttempts: 3,
        timeout: 8000,
      });

      this.socket.once('connect', resolve);
      this.socket.once('connect_error', reject);
    });
  }

  on<K extends keyof ServerEvents>(event: K, handler: (data: ServerEvents[K]) => void): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.socket?.on(event as string, handler as (d: any) => void);
  }

  off<K extends keyof ServerEvents>(event: K, handler: (data: ServerEvents[K]) => void): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.socket?.off(event as string, handler as (d: any) => void);
  }

  emit<K extends keyof ClientEvents>(event: K, data?: ClientEvents[K]): void {
    this.socket?.emit(event, data);
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
