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
  private activeMode: PvCMode | PvPLocalMode | PvPOnlineMode | null = null;
  private roundCount = 0;

  async init(): Promise<void> {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.p1Video = document.getElementById('webcam-p1') as HTMLVideoElement;

    // Boot Three.js scene
    this.scene = new GameScene();
    this.scene.init(canvas, this.p1Video);

    // Boot UI — loading screen shown by default until init completes
    this.ui = new UI('ui-root');
    this.ui.onModeSelect((mode) => this.startMode(mode));
    this.ui.onBack(() => this.returnToMenu());
    this.ui.initModeSelectHover();

    // Start webcam (P1)
    this.ui.setLoadingStatus('Starting webcam…');
    const camOk = await this.startWebcam(this.p1Video);
    if (!camOk) {
      this.ui.setLoadingStatus(
        '⚠ Camera blocked — grant permission then refresh the page.',
      );
      return; // don't proceed; user must grant camera and reload
    }

    // Boot MediaPipe
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

    this.ui.hideLoading();
    setTimeout(() => this.ui.showModeSelect(), 420);
  }

  private async startMode(mode: GameMode): Promise<void> {
    this.roundCount = 0;

    if (mode === 'pvc') {
      this.ui.showGameHud('YOU', 'CPU');
      this.activeMode = new PvCMode(
        this.scene, this.detector, this.p1Video,
        {
          onPhase: (phase, cd) => this.handlePhase(phase, cd),
          onResult: (_p1g, _p2g, winner) => {
            this.roundCount++;
            this.ui.setRound(this.roundCount + 1);
            this.ui.flashScreen();
            if (winner === 1) this.ui.pulseScore(1);
            else if (winner === 2) this.ui.pulseScore(2);
            const label = winner === 0 ? 'DRAW' : winner === 1 ? 'YOU WIN!' : 'CPU WINS';
            const type  = winner === 0 ? 'draw' : winner === 1 ? 'win' : 'lose';
            setTimeout(() => this.ui.showResult(label, type), 700);
          },
          onScore: (p1, p2) => this.ui.setScore(p1, p2),
          onMatchOver: (winner, p1, p2) => this.handleMatchOver(`${winner === 1 ? 'YOU WIN' : 'CPU WINS'} ${p1}–${p2}!`),
          onGestureFeed: (g) => this.ui.updateGesture(g),
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
            this.roundCount++;
            this.ui.setRound(this.roundCount + 1);
            this.ui.flashScreen();
            if (winner === 1) this.ui.pulseScore(1);
            else if (winner === 2) this.ui.pulseScore(2);
            const label = winner === 0 ? 'DRAW!' : `PLAYER ${winner} WINS!`;
            const type  = winner === 0 ? 'draw' : 'win';
            setTimeout(() => this.ui.showResult(label, type), 700);
          },
          onScore: (p1, p2) => this.ui.setScore(p1, p2),
          onMatchOver: (winner, p1, p2) => this.handleMatchOver(`PLAYER ${winner} WINS ${p1}–${p2}!`),
          onGestureFeed: (p1g, p2g) => this.ui.updateGesture(p1g, p2g),
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
          onGestureFeed: (g) => this.ui.updateGesture(g),
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
    this.ui.hideResult();
    switch (phase) {
      case 'countdown':
        this.ui.setCountdown(countdown ?? '');
        this.ui.setPhaseHint('');
        break;
      case 'show':
        this.ui.setCountdown(0);
        this.ui.setPhaseHint('Show your hand!');
        break;
      case 'reveal':
        this.ui.setCountdown('');
        this.ui.setPhaseHint('');
        break;
      case 'idle':
        this.ui.setCountdown('');
        this.ui.setPhaseHint('');
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
    this.ui.hideLeaderboard();
    this.ui.hideConnecting();
    this.ui.showModeSelect();
  }

  /** Returns true if the webcam started successfully. */
  private async startWebcam(video: HTMLVideoElement): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn('getUserMedia not available — page must be served over HTTPS or localhost.');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      return true;
    } catch (err) {
      console.warn('Webcam unavailable:', err);
      return false;
    }
  }
}
