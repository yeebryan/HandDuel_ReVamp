import { GestureDetector } from '../gesture/GestureDetector.js';
import { GameScene } from '../scenes/GameScene.js';
import { SocketClient } from '../network/SocketClient.js';
import type { Gesture, RevealEvent, MatchOverEvent, LeaderboardEntry } from '../types.js';

export interface PvPOnlineHandlers {
  onPhase: (phase: string, countdown?: number) => void;
  onResult: (p1g: Gesture, p2g: Gesture, winner: 0 | 1 | 2) => void;
  onScore: (p1: number, p2: number) => void;
  onMatchOver: (ev: MatchOverEvent) => void;
  onLeaderboard: (entries: LeaderboardEntry[]) => void;
  onDisconnected: () => void;
  onGestureFeed: (g: Gesture) => void;
}

export class PvPOnlineMode {
  private socket: SocketClient;
  private roomId = '';
  private playerSide: 1 | 2 = 1;
  private canSendGesture = false;
  private raf: number | null = null;
  private lastTime = 0;
  private lastSentGesture: Gesture = 'none';

  constructor(
    private scene: GameScene,
    private detector: GestureDetector,
    private video: HTMLVideoElement,
    private handlers: PvPOnlineHandlers,
    private variant: 'casual' | 'competition' = 'competition',
  ) {
    this.socket = new SocketClient();
  }

  async connect(playerName: string): Promise<void> {
    await this.socket.connect();

    const prefix = this.variant === 'competition' ? 'comp' : 'casual';

    this.socket.on(`${prefix}:matched` as 'comp:matched', (ev) => {
      this.roomId = ev.roomId;
      this.playerSide = ev.playerSide;
      this.handlers.onPhase('matched');
    });

    this.socket.on(`${prefix}:countdown` as 'comp:countdown', ({ value }) => {
      this.handlers.onPhase('countdown', value);
    });

    this.socket.on(`${prefix}:show` as 'comp:show', () => {
      this.canSendGesture = true;
      this.lastSentGesture = 'none';
      this.handlers.onPhase('show', 0);
    });

    this.socket.on(`${prefix}:reveal` as 'comp:reveal', (ev: RevealEvent) => {
      this.canSendGesture = false;
      const p1g = this.playerSide === 1 ? ev.p1Gesture : ev.p2Gesture;
      const p2g = this.playerSide === 1 ? ev.p2Gesture : ev.p1Gesture;
      const winner = ev.winner === 0 ? 0 : (ev.winner === this.playerSide ? 1 : 2) as 0 | 1 | 2;

      this.scene.showGestures(p1g, p2g);
      setTimeout(() => {
        this.scene.highlightWinner(winner as 0 | 1 | 2);
        this.scene.triggerShake();
      }, 600);

      this.handlers.onResult(p1g, p2g, winner as 0 | 1 | 2);
      this.handlers.onScore(ev.p1Score, ev.p2Score);
    });

    this.socket.on(`${prefix}:match_over` as 'comp:match_over', (ev: MatchOverEvent) => {
      this.scene.clearGestures();
      this.handlers.onMatchOver(ev);
    });

    if (this.variant === 'competition') {
      this.socket.on('comp:leaderboard', ({ entries }) => {
        this.handlers.onLeaderboard(entries);
      });
    }

    this.socket.on(`${prefix}:opponent_disconnected` as 'comp:opponent_disconnected', () => {
      this.handlers.onDisconnected();
    });

    this.socket.emit(`${prefix}:join` as 'comp:join', { name: playerName });
    this.handlers.onPhase('waiting');

    this.loop(0);
  }

  private loop = (ts: number): void => {
    const dt = Math.min((ts - this.lastTime) / 1000, 0.1);
    this.lastTime = ts;

    const hands = this.detector.detect(this.video);
    const gesture = this.detector.snapshot(hands, 'any');
    this.handlers.onGestureFeed(gesture);

    // Send gesture to server during SHOW phase (send once stable, then updates)
    if (this.canSendGesture && gesture !== 'none' && gesture !== this.lastSentGesture) {
      this.lastSentGesture = gesture;
      const prefix = this.variant === 'competition' ? 'comp' : 'casual';
      this.socket.emit(`${prefix}:gesture` as 'comp:gesture', {
        roomId: this.roomId,
        gesture,
      });
    }

    this.scene.update(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  stop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    const prefix = this.variant === 'competition' ? 'comp' : 'casual';
    this.socket.emit(`${prefix}:leave` as 'comp:leave');
    this.socket.disconnect();
    this.scene.clearGestures();
  }
}
