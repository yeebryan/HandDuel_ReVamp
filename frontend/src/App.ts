import { GameScene } from './scenes/GameScene.js';
import { GestureDetector } from './gesture/GestureDetector.js';
import { UI } from './ui/UI.js';
import { PvCMode } from './modes/PvCMode.js';
import { PvPLocalMode } from './modes/PvPLocalMode.js';
import { PvPOnlineMode } from './modes/PvPOnlineMode.js';
import { submitStreak, fetchTop, fetchOnlineTop, flushQueue, type PvCEntry } from './network/PvCApi.js';
import type { GameMode } from './types.js';
import {
  trackAppLoaded,
  trackCameraGranted,
  trackModeSelected,
  trackGameStarted,
  trackRoundPlayed,
  trackGameOver,
  trackStreakSubmitted,
  trackLeaderboardViewed,
} from './analytics.js';

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
    this.ui.onViewLeaderboard(() => this.viewPvCLeaderboard());
    this.ui.onLeaderboardClose(() => this.ui.hideLeaderboard());
    this.ui.onHowToPlay(() => this.ui.showHowToPlay());

    // Replay any submissions queued from a previous session that failed
    // due to a cold-start or offline moment. Fire-and-forget — UI shouldn't
    // care about the result.
    void flushQueue();
    this.ui.initModeSelectHover();
    trackAppLoaded();

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
        trackCameraGranted();
        this.p1Video.srcObject = stream;
        this.p1Video.play().catch(console.warn);
        setTimeout(() => this.ui.showModeSelect(), 300);
      },
    );
  }

  private async startMode(mode: GameMode): Promise<void> {
    this.roundCount = 0;
    trackModeSelected(mode);

    if (mode === 'pvc') {
      this.ui.showGameHud('YOU', 'CPU');
      this.ui.showGameStartCue();
      this.activeMode = new PvCMode(
        this.scene, this.detector, this.p1Video,
        {
          onPhase: (phase, cd) => this.handlePhase(phase, cd),
          onResult: (p1g, p2g, winner) => {
            trackRoundPlayed('pvc', winner);
            this.ui.flashScreen();
            if (winner === 1) this.ui.pulseScore(1);
            else if (winner === 2) this.ui.pulseScore(2);
            const EMOJI: Record<string, string> = { rock:'✊', paper:'🖐️', scissors:'✌️', none:'❓' };
            const cpuState = winner === 0 ? 'draw' : winner === 1 ? 'lose' : 'win';
            this.ui.setCPUGesture(EMOJI[p2g] ?? '❓', cpuState);

            // Show "LOCKED ✊" immediately so the player sees what got
            // captured — closes the gap for users who change gestures
            // late and don't realize SHOOT was the lock-in moment.
            this.ui.showLockedIn(p1g);

            // Reveal panel comes in slightly after so the LOCKED moment
            // lands first, then the verdict.
            setTimeout(() => {
              this.ui.hideLockedIn();
              this.ui.showRevealPanel(p1g, p2g, winner, 'CPU');
            }, 600);
          },
          onScore: (p1, p2) => {
            // #5 — In PvC, the topbar shows STREAK (not ROUND). Skip the
            // setRound call so it doesn't flicker over the streak display.
            this.ui.setScore(p1, p2);
          },
          onGestureFeed: (g) => {
            this.ui.updateGesture(g);
            this.detector.drawLandmarks(this.landmarkCanvas, this.detector.lastRaw);
          },
          onHoldProgress: (progress, gesture) => {
            this.ui.updateHoldRing(progress, gesture);
          },
          onCPUEmoji: (emoji) => this.ui.setCPUGesture(emoji, ''),
          onStreak: (streak) => this.ui.setStreak(streak),
          onGameOver: (streak) => this.handlePvCGameOver(streak),
        }
      );
      (this.activeMode as PvCMode).start();
      trackGameStarted('pvc');

    } else if (mode === 'pvp-local') {
      this.ui.showGameHud('PLAYER 1', 'PLAYER 2');
      this.ui.showGameStartCue();
      // #3, #6 — no CPU, no hold-to-start in local PvP
      this.ui.setCPUPanelVisible(false);
      this.ui.setHoldRingVisible(false);
      // #8 — keep this hint visible across all phases so first-time
      // players don't lose the instructions on countdown.
      const persistentHint = 'P1 = left hand · P2 = right hand';
      this.ui.setPhaseHint(persistentHint);
      this.activeMode = new PvPLocalMode(
        this.scene, this.detector, this.p1Video,
        {
          onPhase: (phase, cd) => {
            this.handlePhase(phase, cd);
            // Restore the persistent hint after handlePhase clears it
            if (phase !== 'show') this.ui.setPhaseHint(persistentHint);
          },
          onResult: (p1g, p2g, winner) => {
            trackRoundPlayed('pvp-local', winner);
            this.ui.flashScreen();
            if (winner === 1) this.ui.pulseScore(1);
            else if (winner === 2) this.ui.pulseScore(2);
            // #7 — show LOCKED for whichever side had the hand that won/lost
            // contextually. For PvP Local we pick p1's gesture as the lead.
            this.ui.showLockedIn(winner === 2 ? p2g : p1g);
            setTimeout(() => {
              this.ui.hideLockedIn();
              // #1 — pass PLAYER 2 as label, not the default 'CPU'
              this.ui.showRevealPanel(p1g, p2g, winner, 'PLAYER 2');
            }, 600);
            const label = winner === 0 ? 'DRAW!' : `PLAYER ${winner} WINS!`;
            const type  = winner === 0 ? 'draw' : 'win';
            setTimeout(() => this.ui.showResult(label, type), 1300);
          },
          onScore: (p1, p2, round) => { this.ui.setScore(p1, p2); this.ui.setRound(round); },
          // #2 — match-over color reflects actual outcome (no per-player view here,
          // both players see the same screen — keep 'win' for the celebration but
          // include the loser's score so context is clear)
          onMatchOver: (winner, p1, p2) => this.handleMatchOver(`PLAYER ${winner} WINS ${p1}–${p2}!`, 'win'),
          onGestureFeed: (p1g, p2g) => {
            this.ui.updateGesture(p1g, p2g);
            this.detector.drawLandmarks(this.landmarkCanvas, this.detector.lastRaw);
          },
        }
      );
      (this.activeMode as PvPLocalMode).start();
      trackGameStarted('pvp-local');

    } else if (mode === 'pvp-online') {
      const playerName = await this.ui.promptName();
      if (playerName === null) {
        // User cancelled — bail out without showing the game HUD
        return;
      }
      this.ui.showGameHud(playerName, 'OPPONENT');
      this.ui.showGameStartCue();
      // #3 — no CPU in online PvP. Hold ring kept (player has to hold to ready).
      this.ui.setCPUPanelVisible(false);
      this.ui.showConnecting('Connecting to server…');

      let opponentName = 'OPPONENT';
      const onlineMode = new PvPOnlineMode(
        this.scene, this.detector, this.p1Video,
        {
          onMatched: (name) => {
            opponentName = name;
            this.ui.setP2Name(name);
            this.ui.showToast(`${name} has joined the game`);
          },
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
          onResult: (p1g, p2g, winner) => {
            trackRoundPlayed('pvp-online', winner);
            this.roundCount++;
            this.ui.setRound(this.roundCount + 1);
            this.ui.flashScreen();
            if (winner === 1) this.ui.pulseScore(1);
            else if (winner === 2) this.ui.pulseScore(2);
            // #7 — show captured gesture flash
            this.ui.showLockedIn(p1g);
            setTimeout(() => {
              this.ui.hideLockedIn();
              // #1 — label opponent as "OPPONENT" (real names not exchanged
              // by current server protocol)
              this.ui.showRevealPanel(p1g, p2g, winner, opponentName);
            }, 600);
            // Reveal panel already shows the verdict — no extra result text needed
          },
          onScore: (p1, p2) => this.ui.setScore(p1, p2),
          onMatchOver: (ev) => {
            // #2 — show correct color for the per-player outcome
            const isWin = ev.winner === 1;
            const msg = isWin
              ? `YOU WIN! 🔥 ${ev.consecutiveWins} streak!`
              : 'YOU LOSE — Better luck next time!';
            this.handleMatchOver(msg, isWin ? 'win' : 'lose');
            // #4 — removed dead setTimeout(stop) that "re-queued winner".
            // returnToMenu in handleMatchOver already calls activeMode.stop().
          },
          onLeaderboard: (_entries) => { /* never pop leaderboard mid-session */ },
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
        await onlineMode.connect(playerName, (attempt) => {
          this.ui.showConnecting(
            attempt === 1
              ? 'Waking up server… (first visit may take ~30s)'
              : `Retrying… (attempt ${attempt + 1})`,
          );
        });
        trackGameStarted('pvp-online');
      } catch {
        this.ui.hideConnecting();
        this.ui.setPhaseHint('Could not connect — server may be down, try again');
      }
    }
  }

  private handlePhase(phase: string, countdown?: number): void {
    switch (phase) {
      case 'countdown':
        this.ui.hideResult();
        this.ui.hideLockedIn();
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

  private handleMatchOver(msg: string, type: 'win' | 'lose' | 'draw' = 'win'): void {
    this.ui.setCountdown('');
    this.ui.hideRevealPanel();
    this.ui.showResult(msg, type);
    this.ui.setPhaseHint('Returning to menu…');
    setTimeout(() => this.returnToMenu(), 3500);
  }

  private async viewPvCLeaderboard(): Promise<void> {
    trackLeaderboardViewed('pvc');
    this.ui.showLeaderboardLoading();
    const [pvcTop, onlineTop] = await Promise.all([fetchTop(), fetchOnlineTop()]);
    const pvcAdapted = pvcTop.map((e: PvCEntry) => ({
      name: e.name,
      consecutiveWins: e.streak,
      bestStreak: e.streak,
      totalWins: e.streak,
    }));
    this.ui.showLeaderboardWithTabs(pvcAdapted, onlineTop);
  }

  private async handlePvCGameOver(streak: number): Promise<void> {
    trackGameOver(streak);
    // Let the reveal panel show "CPU WINS" cleanly for a beat,
    // then dismiss it before showing the Game Over modal — avoids the
    // overlapping text that happened when both rendered together.
    await new Promise((r) => setTimeout(r, 1200));
    this.ui.hideResult(); // also hides the reveal panel

    // If streak worth saving, prompt for name and fire submission off in
    // the background. submitStreak no longer blocks the UI — if it fails
    // (cold-start, offline) it gets queued in localStorage and retried on
    // the next page load.
    if (streak > 0) {
      const name = await this.ui.promptName();
      // Cancel = don't save to leaderboard, but still flow through to
      // Game Over modal so the player can replay or quit.
      if (name !== null) {
        trackStreakSubmitted(streak);
        submitStreak(name, streak);
      }
    }

    // Ask: play again, or back to menu?
    const choice = await this.ui.promptGameOver(streak);
    if (choice === 'play-again') {
      // Reset HUD and restart the PvC run
      this.ui.setScore(0, 0);
      this.ui.setStreak(0);
      (this.activeMode as PvCMode | null)?.restart();
    } else {
      this.returnToMenu();
    }
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
    this.ui.setScore(0, 0);
    this.ui.setStreak(0);
    this.ui.setRound(1);
    this.ui.hideLeaderboard();
    this.ui.hideConnecting();
    this.ui.hideGameStartCue();
    this.ui.showModeSelect();
  }

}
