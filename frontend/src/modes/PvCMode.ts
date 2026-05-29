import { GameController } from '../game/GameController.js';
import { GestureDetector } from '../gesture/GestureDetector.js';
import { GameScene } from '../scenes/GameScene.js';
import type { Gesture, RoundWinner } from '../types.js';

const HOLD_DURATION_MS = 1400; // ms of stable gesture required to confirm
const CPU_CYCLE_EMOJIS = ['✊', '🖐️', '✌️'];
const CPU_CYCLE_MS = 180;

export interface PvCHandlers {
  onPhase: (phase: string, countdown?: number) => void;
  onResult: (p1g: Gesture, p2g: Gesture, winner: RoundWinner) => void;
  onScore: (p1: number, p2: number) => void;
  onMatchOver: (winner: 1 | 2, p1wins: number, p2wins: number) => void;
  onGestureFeed: (g: Gesture) => void;
  onHoldProgress?: (progress: number, gesture: Gesture | null) => void;
  onCPUEmoji?: (emoji: string) => void;
}

export class PvCMode {
  private ctrl: GameController;
  private raf: number | null = null;
  private lastTime = 0;
  private holdGesture: Gesture = 'none';
  private holdMs = 0;
  private confirmed = false;
  private cpuCycleTimer: ReturnType<typeof setInterval> | null = null;
  private cpuCycleIdx = 0;

  constructor(
    private scene: GameScene,
    private detector: GestureDetector,
    private video: HTMLVideoElement,
    private handlers: PvCHandlers,
  ) {
    this.ctrl = new GameController({ winsNeeded: 2 });
    this.bindEvents();
  }

  private resetHold(): void {
    this.holdGesture = 'none';
    this.holdMs = 0;
    this.confirmed = false;
    this.handlers.onHoldProgress?.(0, null);
  }

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

  private bindEvents(): void {
    this.ctrl.on('phaseChange', (phase) => {
      if (phase === 'countdown') this.startCPUCycle();
      if (phase === 'show' || phase === 'reveal' || phase === 'idle') {
        this.stopCPUCycle();
        if (phase === 'show') this.resetHold();
        if (phase === 'idle') this.handlers.onCPUEmoji?.('❓');
      }
      this.handlers.onPhase(phase);
    });

    this.ctrl.on('countdown', (v) => {
      this.handlers.onPhase('countdown', v);
    });

    this.ctrl.on('result', ({ p1Gesture, p2Gesture, winner }) => {
      this.scene.showGestures(p1Gesture, p2Gesture);
      setTimeout(() => {
        this.scene.highlightWinner(winner);
        this.scene.triggerShake();
      }, 600);
      this.handlers.onResult(p1Gesture, p2Gesture, winner);
    });

    this.ctrl.on('scoreUpdate', ({ p1, p2 }) => {
      this.handlers.onScore(p1, p2);
    });

    this.ctrl.on('matchOver', ({ winner, p1Wins, p2Wins }) => {
      this.scene.clearGestures();
      this.handlers.onMatchOver(winner, p1Wins, p2Wins);
    });
  }

  start(): void {
    this.resetHold();
    this.loop(0);
    this.ctrl.startRound();
  }

  private loop = (ts: number): void => {
    const dtMs = Math.min(ts - this.lastTime, 100);
    const dt   = dtMs / 1000;
    this.lastTime = ts;

    const hands      = this.detector.detect(this.video);
    const p1Gesture  = this.detector.snapshot(hands, 'any');
    const inShowPhase = this.ctrl.getPhase() === 'show';

    if (inShowPhase && !this.confirmed) {
      if (p1Gesture !== 'none' && p1Gesture === this.holdGesture) {
        this.holdMs += dtMs;
      } else {
        this.holdGesture = p1Gesture;
        this.holdMs = 0;
      }

      const progress = Math.min(this.holdMs / HOLD_DURATION_MS, 1);
      this.handlers.onHoldProgress?.(progress, p1Gesture !== 'none' ? p1Gesture : null);

      if (this.holdMs >= HOLD_DURATION_MS && p1Gesture !== 'none') {
        this.confirmed = true;
        this.handlers.onHoldProgress?.(1, p1Gesture);
        this.ctrl.confirmGesture(p1Gesture);
      }
    }

    this.handlers.onGestureFeed(p1Gesture);

    this.scene.update(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  stop(): void {
    if (this.raf !== null) { cancelAnimationFrame(this.raf); this.raf = null; }
    this.stopCPUCycle();
    this.ctrl.destroy();
    this.scene.clearGestures();
  }
}
