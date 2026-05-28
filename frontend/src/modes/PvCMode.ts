import { GameController } from '../game/GameController.js';
import { GestureDetector } from '../gesture/GestureDetector.js';
import { GameScene } from '../scenes/GameScene.js';
import type { Gesture, RoundWinner } from '../types.js';

export interface PvCHandlers {
  onPhase: (phase: string, countdown?: number) => void;
  onResult: (p1g: Gesture, p2g: Gesture, winner: RoundWinner) => void;
  onScore: (p1: number, p2: number) => void;
  onMatchOver: (winner: 1 | 2, p1wins: number, p2wins: number) => void;
  onGestureFeed: (g: Gesture) => void;
}

export class PvCMode {
  private ctrl: GameController;
  private raf: number | null = null;
  private lastTime = 0;

  constructor(
    private scene: GameScene,
    private detector: GestureDetector,
    private video: HTMLVideoElement,
    private handlers: PvCHandlers,
  ) {
    this.ctrl = new GameController({ winsNeeded: 2 });
    this.bindEvents();
  }

  private bindEvents(): void {
    this.ctrl.on('phaseChange', (phase) => {
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
    this.loop(0);
    this.ctrl.startRound();
  }

  private loop = (ts: number): void => {
    const dt = Math.min((ts - this.lastTime) / 1000, 0.1);
    this.lastTime = ts;

    // Feed current gesture into the controller
    const hands = this.detector.detect(this.video);
    const p1Gesture = this.detector.snapshot(hands, 'any');
    // CPU gesture is random (locked at SHOW phase internally)
    this.ctrl.feedGestures(p1Gesture, 'none');
    this.handlers.onGestureFeed(p1Gesture);

    this.scene.update(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  stop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.ctrl.destroy();
    this.scene.clearGestures();
  }
}
