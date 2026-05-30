import { GameScene } from './scenes/GameScene.js';
import { GestureDetector } from './gesture/GestureDetector.js';
import { UI } from './ui/UI.js';
import { PvCMode } from './modes/PvCMode.js';
import { PvPLocalMode } from './modes/PvPLocalMode.js';
import { PvPOnlineMode } from './modes/PvPOnlineMode.js';
import type { GameMode } from './types.js';

export class App {
  private scene!: GameScene;
  private detector!: GestureDetector;
  private ui!: UI;
  private p1Video!: HTMLVideoElement;
  private landmarkCanvas!: HTMLCanvasElement;
  private activeMode: PvCMode | PvPLocalMode | PvPOnlineMode | null = null;
  private roundCount = 0;

  async init(): Promise<void> {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.p1Video       = document.getElementById('webcam-p1') as HTMLVideoElement;
    this.landmarkCanvas = document.getElementById('landmark-canvas') as HTMLCanvasElement;

    // Boot Three.js scene (no video arg needed — webcam is now the page background)
    this.scene = new GameScene();
    this.scene.init(canvas);

    // Boot UI — loading screen shown by default until init completes
    this.ui = new UI('ui-root');
    this.ui.onModeSelect((mode) => this.startMode(mode));
    this.ui.onBack(() => this.returnToMenu());
    this.ui.initModeSelectHover();

    // Boot MediaPipe first (no camera needed yet — user hasn't clicked anything)
    this.ui.setLoadingStatus('Loading gesture detection…');
    this.detector = new GestureDetector();
    try {
      await this.detector.init(2);
    } catch (err) {
      console.error('MediaPipe init failed:', err);
      this.ui.setLoadingStatus(
        '⚠ Gesture detection failed to load. Check network and refresh.',
      );
      return;
    }

    // Show camera permission screen — only calls getUserMedia when user clicks
    this.ui.showCameraScreen(
      () => {
        if (!navigator.mediaDevices?.getUserMedia) {
          return Promise.reject(new DOMException('getUserMedia not supported', 'NotSupportedError'));
        }
        // Use plain `video: true` — no facingMode constraint.
        // Desktop cameras often have no facing mode; adding that constraint
        // causes NotFoundError even when a camera exists.
        // CSS scaleX(-1) on the video element handles the mirror flip.
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      },
      (stream) => {
        // Camera granted — attach stream and proceed to mode select
        this.p1Video.srcObject = stream;
        this.p1Video.play().catch(console.warn);
        setTimeout(() => this.ui.showModeSelect(), 300);
      },
    );
  }

  private async startMode(mode: GameMode): Promise<void> {
    this.roundCount = 0;

    if (mode === 'pvc') {
      this.ui.showGameHud('YOU', 'CPU');
      this.activeMode = new PvCMode(
        this.scene, this.detector, this.p1Video,
        {
          onPhase: (phase, cd) => this.handlePhase(phase, cd),
          onResult: (p1g, p2g, winner) => {
            this.ui.flashScreen();
            if (winner === 1) this.ui.pulseScore(1);
            else if (winner === 2) this.ui.pulseScore(2);
            const EMOJI: Record<string, string> = { rock:'✊', paper:'🖐️', scissors:'✌️', none:'❓' };
            const cpuState = winner === 0 ? 'draw' : winner === 1 ? 'lose' : 'win';
            this.ui.setCPUGesture(EMOJI[p2g] ?? '❓', cpuState);
            this.ui.showRevealPanel(p1g, p2g, winner);
            const label = winner === 0 ? 'DRAW' : winner === 1 ? 'YOU WIN!' : 'CPU WINS';
            const type  = winner === 0 ? 'draw' : winner === 1 ? 'win' : 'lose';
            setTimeout(() => this.ui.showResult(label, type), 400);
          },
          onScore: (p1, p2, round) => {
            this.ui.setScore(p1, p2);
            this.ui.setRound(round);
          },
          onGestureFeed: (g) => {
            this.ui.updateGesture(g);
            this.detector.drawLandmarks(this.landmarkCanvas, this.detector.lastRaw);
          },
          onHoldProgress: (progress, gesture) => {
            this.ui.updateHoldRing(progress, gesture);
          },
          onCPUEmoji: (emoji) => this.ui.setCPUGesture(emoji, ''),
        }
      );
      (this.activeMode as PvCMode).start();

    } else if (mode === 'pvp-local') {
      this.ui.showGameHud('PLAYER 1', 'PLAYER 2');
      this.ui.setPhaseHint('P1 = left hand · P2 = right hand');
      this.activeMode = new PvPLocalMode(
        this.scene, this.detector, this.p1Video,
        {
          onPhase: (phase, cd) => this.handlePhase(phase, cd),
          onResult: (_p1g, _p2g, winner) => {
            this.ui.flashScreen();
            if (winner === 1) this.ui.pulseScore(1);
            else if (winner === 2) this.ui.pulseScore(2);
            const label = winner === 0 ? 'DRAW!' : `PLAYER ${winner} WINS!`;
            const type  = winner === 0 ? 'draw' : 'win';
            setTimeout(() => this.ui.showResult(label, type), 700);
          },
          onScore: (p1, p2, round) => { this.ui.setScore(p1, p2); this.ui.setRound(round); },
          onMatchOver: (winner, p1, p2) => this.handleMatchOver(`PLAYER ${winner} WINS ${p1}–${p2}!`),
          onGestureFeed: (p1g, p2g) => {
            this.ui.updateGesture(p1g, p2g);
            this.detector.drawLandmarks(this.landmarkCanvas, this.detector.lastRaw);
          },
        }
      );
      (this.activeMode as PvPLocalMode).start();

    } else if (mode === 'pvp-online') {
      const playerName = await this.ui.promptName();
      this.ui.showGameHud(playerName, '?');
      this.ui.showConnecting('Connecting to server…');

      const onlineMode = new PvPOnlineMode(
        this.scene, this.detector, this.p1Video,
        {
          onPhase: (phase, cd) => {
            if (phase === 'matched') {
              this.ui.hideConnecting();
              this.ui.setPhaseHint('Matched! Get ready…');
            } else if (phase === 'waiting') {
              this.ui.showConnecting('Finding opponent…');
            } else {
              this.handlePhase(phase, cd);
            }
          },
          onResult: (_p1g, _p2g, winner) => {
            this.roundCount++;
            this.ui.setRound(this.roundCount + 1);
            this.ui.flashScreen();
            if (winner === 1) this.ui.pulseScore(1);
            else if (winner === 2) this.ui.pulseScore(2);
            const label = winner === 0 ? 'DRAW!' : winner === 1 ? 'YOU WIN!' : 'YOU LOSE!';
            const type  = winner === 0 ? 'draw' : winner === 1 ? 'win' : 'lose';
            setTimeout(() => this.ui.showResult(label, type), 700);
          },
          onScore: (p1, p2) => this.ui.setScore(p1, p2),
          onMatchOver: (ev) => {
            const msg = ev.winner === 1
              ? `YOU WIN! 🔥 ${ev.consecutiveWins} streak!`
              : 'YOU LOSE — Better luck next time!';
            this.handleMatchOver(msg);
            // Re-queue winner automatically
            if (ev.winner === 1) {
              setTimeout(() => onlineMode.stop(), 3000);
            }
          },
          onLeaderboard: (entries) => this.ui.showLeaderboard(entries, playerName),
          onDisconnected: () => {
            this.ui.setPhaseHint('Opponent disconnected');
            setTimeout(() => this.returnToMenu(), 2000);
          },
          onGestureFeed: (g) => {
            this.ui.updateGesture(g);
            this.detector.drawLandmarks(this.landmarkCanvas, this.detector.lastRaw);
          },
        },
        'competition',
      );

      this.activeMode = onlineMode;

      try {
        await onlineMode.connect(playerName);
      } catch {
        this.ui.hideConnecting();
        this.ui.setPhaseHint('Could not connect to server');
      }
    }
  }

  private handlePhase(phase: string, countdown?: number): void {
    switch (phase) {
      case 'countdown':
        this.ui.hideResult();
        this.ui.setCountdown(countdown ?? '');
        this.ui.setPhaseHint('');
        break;
      case 'show':
        this.ui.setCountdown(0); // triggers "SHOOT!" display
        this.ui.setPhaseHint('');
        break;
      case 'reveal':
        // Don't hide result here — result will be shown ~600ms after this fires
        this.ui.setCountdown('');
        this.ui.setPhaseHint('');
        break;
      case 'idle':
        // After result — clear and prompt player to hold to play again
        this.ui.hideResult();
        this.ui.setCountdown('');
        this.ui.setPhaseHint('Hold a gesture to play again!');
        break;
    }
  }

  private handleMatchOver(msg: string): void {
    this.ui.setCountdown('');
    this.ui.showResult(msg, 'win');
    this.ui.setPhaseHint('Returning to menu…');
    setTimeout(() => this.returnToMenu(), 3500);
  }

  private returnToMenu(): void {
    this.activeMode?.stop();
    this.activeMode = null;
    this.roundCount = 0;
    this.scene.clearGestures();
    this.scene.resetP2Video();
    // Clear landmark canvas
    const ctx = this.landmarkCanvas.getContext('2d');
    ctx?.clearRect(0, 0, this.landmarkCanvas.width, this.landmarkCanvas.height);
    this.ui.updateHoldRing(0, null);
    this.ui.setCPUGesture('❓', '');
    this.ui.hideLeaderboard();
    this.ui.hideConnecting();
    this.ui.showModeSelect();
  }

}
