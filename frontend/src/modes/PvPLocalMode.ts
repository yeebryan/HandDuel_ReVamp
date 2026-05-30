import { GameController } from '../game/GameController.js';
import { GestureDetector } from '../gesture/GestureDetector.js';
import { GameScene } from '../scenes/GameScene.js';
import type { Gesture, RoundWinner } from '../types.js';

export interface PvPLocalHandlers {
  onPhase: (phase: string, countdown?: number) => void;
  onResult: (p1g: Gesture, p2g: Gesture, winner: RoundWinner) => void;
  onScore: (p1: number, p2: number) => void;
  onMatchOver: (winner: 1 | 2, p1wins: number, p2wins: number) => void;
  onGestureFeed: (p1g: Gesture, p2g: Gesture) => void;
}

/**
 * Local PvP: uses MediaPipe multi-hand detection.
 * Left hand in frame = Player 1 (shown on screen's left).
 * Right hand in frame = Player 2 (shown on screen's right).
 */
export class PvPLocalMode {
  private ctrl: GameController;
  private raf: number | null = null;
  private lastTime = 0;

  constructor(
    private scene: GameScene,
    private detector: GestureDetector,
    private video: HTMLVideoElement,
    private handlers: PvPLocalHandlers,
  ) {
    this.ctrl = new GameController({ winsNeeded: 2 });
    this.bindEvents();
  }

  private matchOver = false;

  private bindEvents(): void {
    this.ctrl.on('phaseChange', (phase) => {
      // Auto-start next round when idle (PvP local doesn't use hold-to-play)
      if (phase === 'idle' && !this.matchOver) {
        setTimeout(() => this.ctrl.startRound(), 800);
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
      this.matchOver = true;
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

    const hands = this.detector.detect(this.video);

    // MediaPipe reports mirrored: "Left" in image = user's right hand
    // We assign: user's RIGHT hand (image-Left) = P1, user's LEFT hand (image-Right) = P2
    // This is natural when both players stand on opposite sides of the camera.
    const p1g: Gesture = this.detector.snapshot(hands, 'Left');
    const p2g: Gesture = this.detector.snapshot(hands, 'Right');

    this.ctrl.feedGestures(p1g, p2g);
    this.handlers.onGestureFeed(p1g, p2g);

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
