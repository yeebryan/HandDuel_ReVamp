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
  shoot: void;       // "SHOOT!" moment — capture gesture now
  result: RoundResult;
  scoreUpdate: { p1: number; p2: number; round: number };
  matchOver: { winner: 1 | 2; p1Wins: number; p2Wins: number };
}

export interface GameConfig {
  winsNeeded?: number;       // Infinity = no match end (default); 2 = best-of-3 for PvP
  countdownFrom?: number;    // default 3
  countdownInterval?: number;// ms per countdown tick (default 750 — hand-duel style)
  resultDuration?: number;   // ms result stays on screen before returning to idle (default 1000)
}

export class GameController extends Emitter<Events> {
  private phase: GamePhase = 'idle';
  private countdown = 0;
  private p1Score = 0;
  private p2Score = 0;
  private roundCount = 0;
  private lockedP1: Gesture = 'none';
  private lockedP2: Gesture = 'none';

  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private shootTimer: ReturnType<typeof setTimeout> | null = null;
  private captureTimer: ReturnType<typeof setTimeout> | null = null;
  private resultTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly winsNeeded: number;
  private readonly countdownFrom: number;
  private readonly countdownInterval: number;
  private readonly resultDuration: number;

  // Legacy show-phase support (PvP local uses feedGestures)
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(cfg: GameConfig & { showDuration?: number } = {}) {
    super();
    this.winsNeeded        = cfg.winsNeeded        ?? Infinity;
    this.countdownFrom     = cfg.countdownFrom     ?? 3;
    this.countdownInterval = cfg.countdownInterval ?? 750;
    this.resultDuration    = cfg.resultDuration    ?? 1000;
  }

  getPhase()    { return this.phase; }
  getScores()   { return { p1: this.p1Score, p2: this.p2Score }; }
  getRound()    { return this.roundCount; }

  reset(): void {
    this.clearTimers();
    this.p1Score = 0;
    this.p2Score = 0;
    this.roundCount = 0;
    this.lockedP1 = 'none';
    this.lockedP2 = 'none';
    this.setPhase('idle');
  }

  /** Begin waiting for player input (hold-to-start). */
  startWaiting(): void {
    this.clearTimers();
    this.lockedP1 = 'none';
    this.lockedP2 = 'none';
    this.setPhase('idle');
  }

  /** Start a round with a countdown → SHOOT capture window. */
  startRound(): void {
    this.clearTimers();
    this.roundCount++;
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
        this.beginShoot();
      }
    }, this.countdownInterval);
  }

  /** SHOOT phase: display "SHOOT!", wait 250ms, fire capture event, wait 250ms, resolve. */
  private beginShoot(): void {
    this.setPhase('show'); // reuse 'show' so UI shows "SHOW!" / "SHOOT!"
    this.emit('countdown', 0);

    // 250ms display window before capture
    this.shootTimer = setTimeout(() => {
      this.shootTimer = null;
      this.emit('shoot', undefined as unknown as void);

      // 250ms after capture signal → resolve with whatever was submitted
      this.captureTimer = setTimeout(() => {
        this.captureTimer = null;
        this.resolveRound();
      }, 250);
    }, 250);
  }

  /** PvP local: feed gestures each frame during show phase */
  feedGestures(p1: Gesture, p2: Gesture): void {
    if (this.phase !== 'show') return;
    if (p1 !== 'none') this.lockedP1 = p1;
    if (p2 !== 'none') this.lockedP2 = p2;
  }

  /** PvC: called in response to 'shoot' event with the live gesture at that moment */
  submitGesture(p1: Gesture): void {
    this.lockedP1 = p1;
  }

  /** PvP local legacy: immediately resolve with supplied gesture */
  confirmGesture(p1: Gesture): void {
    if (this.phase !== 'show') return;
    if (this.showTimer) { clearTimeout(this.showTimer); this.showTimer = null; }
    this.lockedP1 = p1;
    this.resolveRound();
  }

  /** Online mode: externally supply pre-determined results */
  injectResult(p1: Gesture, p2: Gesture): void {
    this.lockedP1 = p1;
    this.lockedP2 = p2;
    this.resolveRound();
  }

  private resolveRound(): void {
    // No-gesture = auto-lose (hand-duel behaviour)
    const p1Lost = this.lockedP1 === 'none';
    if (p1Lost) {
      this.lockedP1 = 'rock';
      this.lockedP2 = 'paper'; // CPU always wins if no gesture
    } else {
      if (this.lockedP2 === 'none') this.lockedP2 = this.randomGesture();
    }

    const winner = rpsResult(this.lockedP1, this.lockedP2);
    if (winner === 1) this.p1Score++;
    if (winner === 2) this.p2Score++;

    const result: RoundResult = { p1Gesture: this.lockedP1, p2Gesture: this.lockedP2, winner };
    this.setPhase('reveal');
    this.emit('result', result);
    this.emit('scoreUpdate', { p1: this.p1Score, p2: this.p2Score, round: this.roundCount });

    this.resultTimer = setTimeout(() => {
      this.resultTimer = null;
      this.checkMatchOver();
    }, this.resultDuration);
  }

  private checkMatchOver(): void {
    if (
      isFinite(this.winsNeeded) &&
      (this.p1Score >= this.winsNeeded || this.p2Score >= this.winsNeeded)
    ) {
      const winner: 1 | 2 = this.p1Score >= this.winsNeeded ? 1 : 2;
      this.emit('matchOver', { winner, p1Wins: this.p1Score, p2Wins: this.p2Score });
      this.setPhase('idle');
    } else {
      this.setPhase('idle');
    }
  }

  private setPhase(p: GamePhase): void {
    this.phase = p;
    this.emit('phaseChange', p);
  }

  private clearTimers(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.showTimer)      clearTimeout(this.showTimer);
    if (this.shootTimer)     clearTimeout(this.shootTimer);
    if (this.captureTimer)   clearTimeout(this.captureTimer);
    if (this.resultTimer)    clearTimeout(this.resultTimer);
    this.countdownTimer = null;
    this.showTimer = null;
    this.shootTimer = null;
    this.captureTimer = null;
    this.resultTimer = null;
  }

  private randomGesture(): Gesture {
    return (['rock', 'paper', 'scissors'] as Gesture[])[Math.floor(Math.random() * 3)];
  }

  destroy(): void {
    this.clearTimers();
  }
}
