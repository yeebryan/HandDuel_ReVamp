import type { Gesture, GamePhase, RoundResult } from '../types.js';
import { rpsResult } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener<T> = (arg: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class Emitter<M extends Record<string, any>> {
  private map = new Map<keyof M, Set<Listener<any>>>();

  on<K extends keyof M>(ev: K, fn: Listener<M[K]>): void {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev)!.add(fn);
  }

  off<K extends keyof M>(ev: K, fn: Listener<M[K]>): void {
    this.map.get(ev)?.delete(fn);
  }

  emit<K extends keyof M>(ev: K, arg: M[K]): void {
    this.map.get(ev)?.forEach((fn) => fn(arg));
  }
}

interface Events {
  phaseChange: GamePhase;
  countdown: number;
  result: RoundResult;
  scoreUpdate: { p1: number; p2: number };
  matchOver: { winner: 1 | 2; p1Wins: number; p2Wins: number };
}

export interface GameConfig {
  winsNeeded?: number;    // best-of format (default 3 rounds total, first to 2)
  showDuration?: number;  // ms for the SHOW window (default 900)
  countdownFrom?: number; // default 3
}

export class GameController extends Emitter<Events> {
  private phase: GamePhase = 'idle';
  private countdown = 0;
  private p1Score = 0;
  private p2Score = 0;
  private lockedP1: Gesture = 'none';
  private lockedP2: Gesture = 'none';

  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private resultTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly winsNeeded: number;
  private readonly showDuration: number;
  private readonly countdownFrom: number;

  constructor(cfg: GameConfig = {}) {
    super();
    this.winsNeeded   = cfg.winsNeeded   ?? 2;
    this.showDuration = cfg.showDuration ?? 900;
    this.countdownFrom = cfg.countdownFrom ?? 3;
  }

  getPhase()  { return this.phase; }
  getScores() { return { p1: this.p1Score, p2: this.p2Score }; }

  reset(): void {
    this.clearTimers();
    this.p1Score = 0;
    this.p2Score = 0;
    this.lockedP1 = 'none';
    this.lockedP2 = 'none';
    this.setPhase('idle');
  }

  startRound(): void {
    this.clearTimers();
    this.lockedP1 = 'none';
    this.lockedP2 = 'none';
    this.setPhase('countdown');
    this.countdown = this.countdownFrom;
    this.emit('countdown', this.countdown);

    this.countdownTimer = setInterval(() => {
      this.countdown--;
      if (this.countdown > 0) {
        this.emit('countdown', this.countdown);
      } else {
        clearInterval(this.countdownTimer!);
        this.countdownTimer = null;
        this.beginShow();
      }
    }, 1000);
  }

  private beginShow(): void {
    this.setPhase('show');
    this.emit('countdown', 0); // signal UI to show "SHOW!"

    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      this.resolveRound();
    }, this.showDuration);
  }

  /** Called each frame by the active mode — locks in gestures during SHOW phase */
  feedGestures(p1: Gesture, p2: Gesture): void {
    if (this.phase !== 'show') return;
    if (p1 !== 'none') this.lockedP1 = p1;
    if (p2 !== 'none') this.lockedP2 = p2;
  }

  /** Hold-to-confirm: immediately resolve with a confirmed gesture before showTimer fires */
  confirmGesture(p1: Gesture): void {
    if (this.phase !== 'show') return;
    if (this.showTimer) { clearTimeout(this.showTimer); this.showTimer = null; }
    this.lockedP1 = p1;
    this.resolveRound();
  }

  /** For online mode — externally supply pre-determined results */
  injectResult(p1: Gesture, p2: Gesture): void {
    this.lockedP1 = p1;
    this.lockedP2 = p2;
    this.resolveRound();
  }

  private resolveRound(): void {
    // If no gesture was detected, pick randomly (for CPU/fallback)
    if (this.lockedP1 === 'none') this.lockedP1 = this.randomGesture();
    if (this.lockedP2 === 'none') this.lockedP2 = this.randomGesture();

    const winner = rpsResult(this.lockedP1, this.lockedP2);
    if (winner === 1) this.p1Score++;
    if (winner === 2) this.p2Score++;

    const result: RoundResult = { p1Gesture: this.lockedP1, p2Gesture: this.lockedP2, winner };
    this.setPhase('reveal');
    this.emit('result', result);
    this.emit('scoreUpdate', { p1: this.p1Score, p2: this.p2Score });

    this.resultTimer = setTimeout(() => {
      this.resultTimer = null;
      this.checkMatchOver();
    }, 2500);
  }

  private checkMatchOver(): void {
    if (this.p1Score >= this.winsNeeded || this.p2Score >= this.winsNeeded) {
      const winner: 1 | 2 = this.p1Score >= this.winsNeeded ? 1 : 2;
      this.emit('matchOver', { winner, p1Wins: this.p1Score, p2Wins: this.p2Score });
      this.setPhase('idle');
    } else {
      this.startRound();
    }
  }

  private setPhase(p: GamePhase): void {
    this.phase = p;
    this.emit('phaseChange', p);
  }

  private clearTimers(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.showTimer)      clearTimeout(this.showTimer);
    if (this.resultTimer)    clearTimeout(this.resultTimer);
    this.countdownTimer = null;
    this.showTimer = null;
    this.resultTimer = null;
  }

  private randomGesture(): Gesture {
    return (['rock', 'paper', 'scissors'] as Gesture[])[Math.floor(Math.random() * 3)];
  }

  destroy(): void {
    this.clearTimers();
  }
}
