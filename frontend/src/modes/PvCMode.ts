import { GameController } from '../game/GameController.js';
import { GestureDetector } from '../gesture/GestureDetector.js';
import { GameScene } from '../scenes/GameScene.js';
import type { Gesture, RoundWinner } from '../types.js';

const HOLD_DURATION_MS = 1500; // match hand-duel's 1500ms hold
const CPU_CYCLE_EMOJIS = ['✊', '🖐️', '✌️'];
const CPU_CYCLE_MS = 180;

export interface PvCHandlers {
  onPhase: (phase: string, countdown?: number) => void;
  onResult: (p1g: Gesture, p2g: Gesture, winner: RoundWinner) => void;
  onScore: (p1: number, p2: number, round: number) => void;
  onGestureFeed: (g: Gesture) => void;
  onHoldProgress?: (progress: number, gesture: Gesture | null) => void;
  onCPUEmoji?: (emoji: string) => void;
  onStreak?: (streak: number) => void;
  onGameOver?: (streak: number) => void;
}

export class PvCMode {
  private ctrl: GameController;
  private raf: number | null = null;
  private lastTime = 0;

  // Hold-to-start state
  private holdGesture: Gesture = 'none';
  private holdMs = 0;
  private holdDone = false;       // true once hold completes (prevents re-trigger mid-countdown)

  // CPU emoji cycling
  private cpuCycleTimer: ReturnType<typeof setInterval> | null = null;
  private cpuCycleIdx = 0;

  // Current live gesture (for capture at SHOOT)
  private liveGesture: Gesture = 'none';

  // Streak: consecutive wins vs CPU; ends on first loss
  private streak = 0;
  private gameOver = false;

  constructor(
    private scene: GameScene,
    private detector: GestureDetector,
    private video: HTMLVideoElement,
    private handlers: PvCHandlers,
  ) {
    // Infinite play — no match end, cumulative scoring, 750ms countdown ticks
    this.ctrl = new GameController({ countdownInterval: 750, resultDuration: 1500 });
    this.bindEvents();
  }

  // ─── CPU emoji cycling ────────────────────────

  private startCPUCycle(): void {
    this.stopCPUCycle();
    this.cpuCycleIdx = 0;
    this.handlers.onCPUEmoji?.(CPU_CYCLE_EMOJIS[0]);
    this.cpuCycleTimer = setInterval(() => {
      this.cpuCycleIdx = (this.cpuCycleIdx + 1) % CPU_CYCLE_EMOJIS.length;
      this.handlers.onCPUEmoji?.(CPU_CYCLE_EMOJIS[this.cpuCycleIdx]);
    }, CPU_CYCLE_MS);
  }

  private stopCPUCycle(): void {
    if (this.cpuCycleTimer) { clearInterval(this.cpuCycleTimer); this.cpuCycleTimer = null; }
  }

  // ─── Hold ring reset ──────────────────────────

  private resetHold(): void {
    this.holdGesture = 'none';
    this.holdMs = 0;
    this.holdDone = false;
    this.handlers.onHoldProgress?.(0, null);
  }

  // ─── Event wiring ─────────────────────────────

  private bindEvents(): void {
    this.ctrl.on('phaseChange', (phase) => {
      if (phase === 'idle') {
        // Between rounds: reset hold, CPU back to ❓, prompt player
        this.resetHold();
        this.stopCPUCycle();
        this.handlers.onCPUEmoji?.('❓');
        this.handlers.onPhase('idle');

      } else if (phase === 'countdown') {
        // Countdown started (hold completed) — CPU starts cycling, ring clears
        this.resetHold();
        this.startCPUCycle();
        this.handlers.onPhase('countdown');

      } else if (phase === 'show') {
        // "SHOOT!" moment
        this.stopCPUCycle();
        this.handlers.onPhase('show');

      } else if (phase === 'reveal') {
        this.handlers.onPhase('reveal');

      } else {
        this.handlers.onPhase(phase);
      }
    });

    this.ctrl.on('countdown', (v) => {
      this.handlers.onPhase('countdown', v);
    });

    // SHOOT event: capture whatever gesture the player is showing right now
    this.ctrl.on('shoot', () => {
      this.ctrl.submitGesture(this.liveGesture);
    });

    this.ctrl.on('result', ({ p1Gesture, p2Gesture, winner }) => {
      this.scene.showGestures(p1Gesture, p2Gesture);
      setTimeout(() => {
        this.scene.highlightWinner(winner);
        this.scene.triggerShake();
      }, 400);
      this.handlers.onResult(p1Gesture, p2Gesture, winner);

      // Streak: +1 on win, unchanged on draw, GAME OVER on loss
      if (winner === 1) {
        this.streak += 1;
        this.handlers.onStreak?.(this.streak);
      } else if (winner === 2) {
        const finalStreak = this.streak;
        this.gameOver = true;
        this.handlers.onGameOver?.(finalStreak);
      }
    });

    this.ctrl.on('scoreUpdate', ({ p1, p2, round }) => {
      this.handlers.onScore(p1, p2, round);
    });

    // matchOver never fires with infinite winsNeeded, but keep for safety
    this.ctrl.on('matchOver', () => {
      this.stopCPUCycle();
      this.scene.clearGestures();
    });
  }

  // ─── Public API ───────────────────────────────

  start(): void {
    this.resetHold();
    this.streak = 0;
    this.gameOver = false;
    this.handlers.onStreak?.(0);
    this.loop(0);
    this.ctrl.startWaiting(); // go idle → phaseChange fires → sets up hold prompt
  }

  /** Restart after a game-over (player taps "Play again"). */
  restart(): void {
    this.streak = 0;
    this.gameOver = false;
    this.resetHold();
    this.handlers.onStreak?.(0);
    // Full controller reset so cumulative score / round counter zero out
    this.ctrl.reset();
  }

  stop(): void {
    if (this.raf !== null) { cancelAnimationFrame(this.raf); this.raf = null; }
    this.stopCPUCycle();
    this.ctrl.destroy();
    this.scene.clearGestures();
  }

  // ─── Animation loop ───────────────────────────

  private loop = (ts: number): void => {
    const dtMs = Math.min(ts - this.lastTime, 100);
    const dt   = dtMs / 1000;
    this.lastTime = ts;

    const hands = this.detector.detect(this.video);
    this.liveGesture = this.detector.snapshot(hands, 'any');

    const inIdle = this.ctrl.getPhase() === 'idle';

    // Hold-to-start: only active when idle, not yet triggered, and not game-over
    if (inIdle && !this.holdDone && !this.gameOver) {
      if (this.liveGesture !== 'none' && this.liveGesture === this.holdGesture) {
        this.holdMs += dtMs;
      } else {
        // Gesture changed — reset hold timer
        this.holdGesture = this.liveGesture;
        this.holdMs = 0;
      }

      const progress = Math.min(this.holdMs / HOLD_DURATION_MS, 1);
      this.handlers.onHoldProgress?.(progress, this.liveGesture !== 'none' ? this.liveGesture : null);

      if (this.holdMs >= HOLD_DURATION_MS && this.liveGesture !== 'none') {
        this.holdDone = true;
        this.handlers.onHoldProgress?.(1, this.liveGesture);
        // Hold complete → kick off the countdown
        this.ctrl.startRound();
      }
    }

    this.handlers.onGestureFeed(this.liveGesture);

    this.scene.update(dt);
    this.raf = requestAnimationFrame(this.loop);
  };
}
