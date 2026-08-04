import type { Gesture, LeaderboardEntry, GameMode } from '../types.js';
import {
  ICON_DUEL,
  ICON_GRADIENT_DEFS,
  ICON_ROBOT_SOLID,
  ICON_CROWN_SOLID,
  ICON_FIRE,
  ICON_TROPHY,
} from './icons.js';
import {
  animateModeSelectIn,
  attachIconHover,
  animateCountdownTick,
  animateResultIn,
  animateLoadingOut,
} from './UIAnimations.js';

const GESTURE_EMOJI: Record<Gesture, string> = {
  rock: '✊', paper: '🖐', scissors: '✌', none: '…',
};

export class UI {
  private root: HTMLElement;

  // Screen elements (created on init)
  private loadingScreen!: HTMLElement;
  private loadingStatus!: HTMLElement;
  private cameraScreen!: HTMLElement;
  private modeSelect!: HTMLElement;
  private gameHud!: HTMLElement;
  private leaderboard!: HTMLElement;
  private nameModal!: HTMLElement;
  private connectingOverlay!: HTMLElement;
  private flashOverlay!: HTMLElement;

  // HUD refs
  private p1NameEl!: HTMLElement;
  private p2NameEl!: HTMLElement;
  private p1ScoreEl!: HTMLElement;
  private p2ScoreEl!: HTMLElement;
  private roundEl!: HTMLElement;
  private countdownEl!: HTMLElement;
  private resultEl!: HTMLElement;
  private phaseHintEl!: HTMLElement;
  private gestureNameEl!: HTMLElement;
  private gestureP2El!: HTMLElement;
  private holdRingWrap!: HTMLElement;
  private holdRingFill!: SVGCircleElement;
  private revealPanel!: HTMLElement;
  private revealP1Slot!: HTMLElement;
  private revealP2Slot!: HTMLElement;
  private revealP1Emoji!: HTMLElement;
  private revealP2Emoji!: HTMLElement;
  // New HUD refs
  private cpuPanelEl!: HTMLElement;
  private cpuEmojiEl!: HTMLElement;
  private gesturePillEl!: HTMLElement;
  private hintTextEl!: HTMLElement;

  constructor(rootId = 'ui-root') {
    this.root = document.getElementById(rootId)!;
    this.root.innerHTML = this.buildHTML();
    this.cacheRefs();
  }

  private buildHTML(): string {
    return `
${ICON_GRADIENT_DEFS}
<!-- Loading screen -->
<div id="loading-screen">
  <div class="loading-title">HAND DUEL</div>
  <div class="loading-dots"><span></span><span></span><span></span><span></span><span></span></div>
  <div class="loading-status" id="loading-status">Loading gesture detection…</div>
</div>

<!-- Camera permission screen (shown after gesture engine loads) -->
<div id="camera-screen" class="screen hidden">
  <div class="cam-icon">📷</div>
  <div class="cam-title">Camera Required</div>
  <div class="cam-desc">This game reads your hand gestures in real time.<br>Nothing is recorded or transmitted.</div>
  <button class="cam-btn" id="cam-enable-btn">Enable Camera</button>
  <div class="cam-error hidden" id="cam-error">
    <p id="cam-error-text">Camera access was blocked.</p>
    <p class="cam-error-hint">Click the camera icon in your browser's address bar to reset permission, then try again.</p>
    <button class="cam-btn cam-btn-retry" id="cam-retry-btn">Try Again</button>
  </div>
</div>

<!-- Mode Select -->
<div id="mode-select" class="screen hidden">
  <div class="game-title">HAND DUEL</div>
  <div class="game-subtitle">Rock · Paper · Scissors</div>
  <div class="mode-grid">
    <button class="mode-btn" data-mode="pvc">
      <div class="mode-icon">${ICON_ROBOT_SOLID}</div>
      <div class="mode-name">Player vs CPU</div>
      <div class="mode-desc">Challenge the machine</div>
    </button>
    <button class="mode-btn mode-hidden" data-mode="pvp-local" aria-hidden="true" tabindex="-1">
      <div class="mode-icon">${ICON_DUEL}</div>
      <div class="mode-name">Local PvP</div>
      <div class="mode-desc">Left hand vs Right hand</div>
    </button>
    <button class="mode-btn mode-disabled" disabled aria-disabled="true">
      <div class="mode-paused-badge">Paused</div>
      <div class="mode-icon">${ICON_CROWN_SOLID}</div>
      <div class="mode-name">Competition</div>
      <div class="mode-desc">Online play is paused for now</div>
    </button>
  </div>
  <div class="mode-actions">
    <button class="lb-view-btn" id="view-leaderboard-btn">${ICON_TROPHY} View Leaderboard</button>
    <button class="lb-view-btn" id="how-to-play-btn">ⓘ How to Play</button>
  </div>
</div>

<!-- How to Play modal — accessible from mode select -->
<div id="how-to-play-modal" class="hidden">
  <div class="modal-box htp-modal">
    <h2>How to Play</h2>
    <ol class="htp-steps">
      <li>
        <div class="htp-icon">🖐️</div>
        <div class="htp-text">
          <strong>Hold a gesture</strong>
          Show ✊ rock, 🖐️ paper, or ✌️ scissors to the camera. The ring fills as you hold.
        </div>
      </li>
      <li>
        <div class="htp-icon">3·2·1</div>
        <div class="htp-text">
          <strong>Watch the countdown</strong>
          When the ring fills, the round begins: 3 → 2 → 1 → SHOOT.
        </div>
      </li>
      <li>
        <div class="htp-icon">⚡</div>
        <div class="htp-text">
          <strong>Lock in at SHOOT</strong>
          Your gesture is captured exactly when "SHOOT!" appears. Commit by then — not at "1".
        </div>
      </li>
      <li>
        <div class="htp-icon">${ICON_FIRE}</div>
        <div class="htp-text">
          <strong>Build your streak</strong>
          In Player vs CPU, one loss ends your run. Submit your name to the global leaderboard.
        </div>
      </li>
      <li>
        <div class="htp-icon">${ICON_TROPHY}</div>
        <div class="htp-text">
          <strong>Online: First to 2 wins</strong>
          In PvP Online, the first player to win 2 rounds takes the match. Draws don't count for either side.
        </div>
      </li>
    </ol>
    <button class="submit-btn" id="how-to-play-close">Got it</button>
  </div>
</div>

<!-- Game HUD -->
<div id="game-hud" class="screen hidden">

  <!-- Top bar: scores only -->
  <div class="hud-topbar">
    <div class="hud-score-block">
      <span class="hud-score-name" id="p1-name">YOU</span>
      <span class="hud-score-val p1" id="p1-score">0</span>
    </div>
    <div class="hud-round" id="round-display">ROUND 1</div>
    <div class="hud-score-block reverse">
      <span class="hud-score-val p2" id="p2-score">0</span>
      <span class="hud-score-name" id="p2-name">CPU</span>
    </div>
  </div>

  <!-- CPU panel: floating top-right, shows ❓ → cycling → revealed gesture -->
  <div id="cpu-panel" title="CPU picks randomly before the round — it can't see your hand.">
    <div id="cpu-emoji">❓</div>
    <div class="cpu-label">CPU</div>
    <div class="cpu-fair-tag">🎲 RANDOM</div>
  </div>

  <!-- Arena: large countdown + result text -->
  <div class="hud-arena">
    <div class="countdown-ring" id="countdown-ring"></div>
    <div class="countdown-display" id="countdown-display"></div>
    <div class="result-display hidden" id="result-display"></div>
    <div class="phase-hint" id="phase-hint"></div>
    <!-- Captured-gesture flash: shows "LOCKED IN ✊" briefly at SHOOT so
         the player knows what got captured, even if their hand moves after -->
    <div class="locked-in-display hidden" id="locked-in-display"></div>
    <!-- Inline 2-second tutorial cue shown at game start; auto-dismisses -->
    <div class="game-start-cue hidden" id="game-start-cue">
      <div class="cue-line"><span class="cue-emoji">🖐️</span> Hold a gesture</div>
      <div class="cue-arrow">↓</div>
      <div class="cue-line"><span class="cue-emoji">⚡</span> Lock in at <strong>SHOOT</strong></div>
    </div>
  </div>

  <!-- Reveal panel: side-by-side after each round -->
  <div id="reveal-panel">
    <div class="reveal-cards">
      <div class="reveal-slot" id="reveal-p1-slot">
        <span class="reveal-emoji" id="reveal-p1-emoji">✊</span>
        <span class="reveal-label" id="reveal-p1-label">YOU</span>
      </div>
      <div class="reveal-vs">VS</div>
      <div class="reveal-slot" id="reveal-p2-slot">
        <span class="reveal-emoji" id="reveal-p2-emoji">🤖</span>
        <span class="reveal-label" id="reveal-p2-label">CPU</span>
      </div>
    </div>
    <div class="reveal-verdict" id="reveal-verdict"></div>
  </div>

  <!-- Bottom bar: menu + hold ring + gesture pill + status hint -->
  <div class="hud-bottombar">
    <button class="back-btn" id="back-btn">← Menu</button>
    <div id="hold-ring-wrap">
      <svg class="hold-ring-svg" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="22" class="hold-ring-track"/>
        <circle cx="25" cy="25" r="22" class="hold-ring-fill" id="hold-ring-fill"/>
      </svg>
    </div>
    <div id="gesture-pill">
      <span id="gesture-name">–</span>
      <span id="gesture-p2" style="display:none"></span>
    </div>
    <div class="hint-text" id="hint-text">No hand detected</div>
  </div>

</div>

<!-- Leaderboard (online competition + PvC view) -->
<div id="leaderboard" class="hidden">
  <div class="modal-box lb-modal">
    <h2 id="leaderboard-title">${ICON_FIRE} Top Streaks</h2>
    <div class="lb-subtitle" id="leaderboard-subtitle">Player vs CPU</div>
    <div class="lb-tabs hidden" id="lb-tabs">
      <button class="lb-tab active" data-tab="pvc">${ICON_FIRE} PvC</button>
      <button class="lb-tab" data-tab="online">${ICON_TROPHY} Online</button>
    </div>
    <div id="leaderboard-list"></div>
    <button class="submit-btn ghost" id="leaderboard-close">Close</button>
  </div>
</div>

<!-- Toast notification (join alerts etc.) -->
<div id="toast" class="hidden"></div>

<!-- Name entry modal -->
<div id="name-modal" class="hidden">
  <div class="modal-box">
    <h2>Enter your name</h2>
    <p>You'll be shown on the global leaderboard</p>
    <input id="player-name-input" type="text" maxlength="16" placeholder="Your name…" autocomplete="off" />
    <div class="name-modal-actions">
      <button class="submit-btn ghost" id="name-cancel">Cancel</button>
      <button class="submit-btn" id="name-submit">Continue</button>
    </div>
  </div>
</div>

<!-- Game Over modal (PvC end-of-run) -->
<div id="game-over-modal" class="hidden">
  <div class="modal-box game-over-box">
    <div class="go-flame-wrap" id="go-flame-wrap">
      <div class="go-flame-glow"></div>
      <svg class="go-flame-svg" width="96" height="110" viewBox="0 0 96 110" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="go-fg" x1="48" y1="0" x2="48" y2="110" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#ffd54a"/>
            <stop offset="0.45" stop-color="#ff9633"/>
            <stop offset="1" stop-color="#ff5722"/>
          </linearGradient>
          <linearGradient id="go-fi" x1="48" y1="40" x2="48" y2="104" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#fff8d9"/>
            <stop offset="1" stop-color="#ffc14a"/>
          </linearGradient>
        </defs>
        <path d="M48 2c4 16-10 24-14 36-3 9-1 16 3 22-8-3-14-10-15-20C12 50 6 62 6 74c0 20 19 34 42 34s42-14 42-34c0-16-10-26-18-38-6-9-8-18-4-28-10 4-16 12-17 22C48 22 44 12 48 2z" fill="url(#go-fg)"/>
        <path d="M48 46c2 10-6 15-8 22-1.5 5.5 0 10 3 13-5-1.5-8.5-5.5-9.5-11C30 74 27 80 27 87c0 12 9.5 19 21 19s21-7 21-19c0-9-5.5-14.5-10-21-3.5-5-4.5-10-2.5-16-5.5 2.5-8.5 7-9.5 13-1-6-2-12 1-17z" fill="url(#go-fi)"/>
      </svg>
    </div>
    <div class="go-streak-num" id="go-streak-num">0</div>
    <div class="go-streak-label" id="go-streak-label">WIN STREAK</div>
    <div class="go-pb-badge hidden" id="go-pb-badge">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2z" fill="currentColor"/></svg>
      NEW PERSONAL BEST
    </div>
    <div class="game-over-actions">
      <button class="submit-btn" id="game-over-restart">Play Again</button>
      <button class="submit-btn ghost" id="game-over-menu">← Back to Menu</button>
    </div>
  </div>
</div>

<!-- Connecting / waiting overlay -->
<div id="connecting-overlay" class="hidden">
  <div class="spinner"></div>
  <div class="connecting-text" id="connecting-text">Connecting…</div>
</div>

<!-- Flash on gesture lock -->
<div class="flash-overlay" id="flash-overlay"></div>
`;
  }

  private cacheRefs(): void {
    this.loadingScreen       = this.root.querySelector('#loading-screen')!;
    this.loadingStatus       = this.root.querySelector('#loading-status')!;
    this.cameraScreen        = this.root.querySelector('#camera-screen')!;
    this.modeSelect          = this.root.querySelector('#mode-select')!;
    this.gameHud             = this.root.querySelector('#game-hud')!;
    this.leaderboard         = this.root.querySelector('#leaderboard')!;
    this.nameModal           = this.root.querySelector('#name-modal')!;
    this.connectingOverlay   = this.root.querySelector('#connecting-overlay')!;
    this.flashOverlay        = this.root.querySelector('#flash-overlay')!;
    this.p1NameEl            = this.root.querySelector('#p1-name')!;
    this.p2NameEl            = this.root.querySelector('#p2-name')!;
    this.p1ScoreEl           = this.root.querySelector('#p1-score')!;
    this.p2ScoreEl           = this.root.querySelector('#p2-score')!;
    this.roundEl             = this.root.querySelector('#round-display')!;
    this.countdownEl         = this.root.querySelector('#countdown-display')!;
    this.resultEl            = this.root.querySelector('#result-display')!;
    this.phaseHintEl         = this.root.querySelector('#phase-hint')!;
    this.gestureNameEl       = this.root.querySelector('#gesture-name')!;
    this.gestureP2El         = this.root.querySelector('#gesture-p2')!;
    this.holdRingWrap        = this.root.querySelector('#hold-ring-wrap')!;
    this.holdRingFill        = this.root.querySelector('#hold-ring-fill')!;
    this.revealPanel         = this.root.querySelector('#reveal-panel')!;
    this.revealP1Slot        = this.root.querySelector('#reveal-p1-slot')!;
    this.revealP2Slot        = this.root.querySelector('#reveal-p2-slot')!;
    this.revealP1Emoji       = this.root.querySelector('#reveal-p1-emoji')!;
    this.revealP2Emoji       = this.root.querySelector('#reveal-p2-emoji')!;
    this.cpuPanelEl          = this.root.querySelector('#cpu-panel')!;
    this.cpuEmojiEl          = this.root.querySelector('#cpu-emoji')!;
    this.gesturePillEl       = this.root.querySelector('#gesture-pill')!;
    this.hintTextEl          = this.root.querySelector('#hint-text')!;
  }

  // ─── Loading screen ───────────────────────────

  showLoading(status?: string): void {
    if (status) this.loadingStatus.textContent = status;
    this.show(this.loadingScreen);
  }

  hideLoading(): void {
    animateLoadingOut(this.loadingScreen, () => {
      this.hide(this.loadingScreen);
    });
  }

  setLoadingStatus(text: string): void {
    this.loadingStatus.textContent = text;
  }

  // ─── Camera permission screen ─────────────────

  /**
   * Hide the loading screen and show the camera permission screen.
   * Returns a Promise that resolves when the user grants camera access.
   * Rejects if they can't be unblocked (e.g. permission permanently denied).
   * `requestCamera` should call getUserMedia and return the stream or throw.
   */
  showCameraScreen(
    requestCamera: () => Promise<MediaStream>,
    onGranted: (stream: MediaStream) => void,
  ): void {
    animateLoadingOut(this.loadingScreen, () => this.hide(this.loadingScreen));
    this.show(this.cameraScreen);

    const enableBtn  = this.root.querySelector('#cam-enable-btn') as HTMLButtonElement;
    const retryBtn   = this.root.querySelector('#cam-retry-btn') as HTMLButtonElement;
    const errorEl    = this.root.querySelector('#cam-error') as HTMLElement;
    const errorText  = this.root.querySelector('#cam-error-text') as HTMLElement;

    const attempt = async () => {
      enableBtn.disabled = true;
      enableBtn.textContent = 'Requesting…';
      errorEl.classList.add('hidden');
      try {
        const stream = await requestCamera();
        this.hide(this.cameraScreen);
        onGranted(stream);
      } catch (err: unknown) {
        enableBtn.disabled = false;
        enableBtn.textContent = 'Enable Camera';
        errorEl.classList.remove('hidden');
        const name = (err as { name?: string })?.name ?? '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          errorText.textContent = 'Camera access was blocked.';
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          errorText.textContent = 'Camera not found — make sure nothing else is using it.';
        } else if (name === 'NotSupportedError') {
          errorText.textContent = 'Camera API not available. Try Chrome or Firefox over HTTPS.';
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          errorText.textContent = 'Camera is in use by another app — close it and try again.';
        } else {
          errorText.textContent = `Camera error: ${name || String(err)}`;
        }
      }
    };

    enableBtn.addEventListener('click', attempt);
    retryBtn.addEventListener('click', attempt);
  }

  // ─── Screen switching ─────────────────────────

  showModeSelect(): void {
    this.hide(this.loadingScreen);
    this.show(this.modeSelect);
    this.hide(this.gameHud);
    this.hide(this.leaderboard);
    this.hideGestureIndicator();
    // Stagger cards in + draw SVG icons
    animateModeSelectIn(this.modeSelect);
  }

  /** Call once after first render to wire up icon hover springs. */
  initModeSelectHover(): void {
    attachIconHover(this.modeSelect);
  }

  showGameHud(p1Name: string, p2Name: string): void {
    this.hide(this.modeSelect);
    // Make sure any modal that was open on the menu doesn't leak into the game.
    // Common case: user opened "View Leaderboard" then clicked a mode before
    // the tap-to-dismiss listener attached.
    this.hide(this.leaderboard);
    this.show(this.gameHud);
    this.p1NameEl.textContent = p1Name;
    this.p2NameEl.textContent = p2Name;
    this.setCountdown('');
    this.hideResult();
    this.setPhaseHint('');
    this.setCPUGesture('❓', '');
    this.setGestureHint('No hand detected');
    this.updateHoldRing(0, null);
    // Reset HUD-element visibility so a previous mode's hidden state doesn't
    // carry over into the next mode.
    this.setCPUPanelVisible(true);
    this.setHoldRingVisible(true);
  }

  /** Show/hide the floating top-right CPU panel. Hide for PvP modes. */
  setCPUPanelVisible(visible: boolean): void {
    if (visible) this.show(this.cpuPanelEl);
    else this.hide(this.cpuPanelEl);
  }

  /** Show/hide the bottom-bar hold-to-start ring. Hide for modes that
   *  auto-advance rounds (PvP Local). */
  setHoldRingVisible(visible: boolean): void {
    if (visible) this.show(this.holdRingWrap);
    else this.hide(this.holdRingWrap);
  }

  onModeSelect(cb: (mode: GameMode) => void): void {
    this.modeSelect.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset['mode'] as GameMode;
        cb(mode);
      });
    });
  }

  onBack(cb: () => void): void {
    this.root.querySelector('#back-btn')!.addEventListener('click', cb);
  }

  onViewLeaderboard(cb: () => void): void {
    this.root.querySelector('#view-leaderboard-btn')!.addEventListener('click', cb);
  }

  // ─── How to Play modal ──────────────────────

  onHowToPlay(cb: () => void): void {
    this.root.querySelector('#how-to-play-btn')!.addEventListener('click', cb);
    this.root.querySelector('#how-to-play-close')!.addEventListener('click', () => this.hideHowToPlay());
  }

  showHowToPlay(): void {
    this.show(this.root.querySelector('#how-to-play-modal') as HTMLElement);
  }

  hideHowToPlay(): void {
    this.hide(this.root.querySelector('#how-to-play-modal') as HTMLElement);
  }

  /** Show the 2-second inline cue at game start. Auto-dismisses. */
  showGameStartCue(): void {
    const el = this.root.querySelector('#game-start-cue') as HTMLElement;
    el.classList.remove('hidden', 'fade-out');
    // Trigger fade-out after 1.7s, then hide at 2.2s
    setTimeout(() => el.classList.add('fade-out'), 1700);
    setTimeout(() => el.classList.add('hidden'), 2200);
  }

  hideGameStartCue(): void {
    (this.root.querySelector('#game-start-cue') as HTMLElement).classList.add('hidden');
  }

  // ─── HUD updates ─────────────────────────────

  setP2Name(name: string): void {
    this.p2NameEl.textContent = name;
  }

  setScore(p1: number, p2: number): void {
    this.p1ScoreEl.textContent = String(p1);
    this.p2ScoreEl.textContent = String(p2);
  }

  pulseScore(player: 1 | 2): void {
    const el = player === 1 ? this.p1ScoreEl : this.p2ScoreEl;
    el.classList.remove('pulse');
    void el.offsetHeight; // reflow
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 600);
  }

  setRound(n: number): void {
    this.roundEl.textContent = `ROUND ${n}`;
  }

  /** Best-of pips for online duels — one dot per win needed, filled as
   *  rounds are won. Replaces the ROUND text so "first to N" is always
   *  visible instead of a toast that fades. */
  setDuelPips(p1Wins: number, p2Wins: number, winsNeeded = 2): void {
    this.roundEl.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'duel-pips';

    const makeGroup = (wins: number, cls: string) => {
      const group = document.createElement('span');
      group.className = 'pip-group';
      for (let i = 0; i < winsNeeded; i++) {
        const pip = document.createElement('i');
        pip.className = i < wins ? `pip ${cls}` : 'pip';
        group.append(pip);
      }
      return group;
    };

    const label = document.createElement('span');
    label.className = 'pips-label';
    label.textContent = `FIRST TO ${winsNeeded}`;

    wrap.append(makeGroup(p1Wins, 'filled-p1'), label, makeGroup(p2Wins, 'filled-p2'));
    this.roundEl.append(wrap);
  }

  setStreak(n: number): void {
    // n is always a game-controlled number, never user input — safe to build via innerHTML
    this.roundEl.innerHTML = `STREAK ${n} <span class="icon-inline-sm">${ICON_FIRE}</span>`;
  }

  setCountdown(v: number | string): void {
    const el   = this.countdownEl;
    const ring = this.root.querySelector('#countdown-ring') as HTMLElement | null;
    const isShow = v === 0 || v === '0';

    // Empty string = clear/hide — display:none beats min-height and any
    // in-flight Anime.js animation that would otherwise keep SHOOT! visible
    if (v === '') {
      el.textContent = '';
      el.classList.remove('show-phase');
      el.classList.add('hidden');
      return;
    }

    el.classList.remove('hidden');

    if (isShow) {
      el.textContent = 'SHOOT!';
      el.classList.add('show-phase');
    } else {
      el.textContent = v === '' ? '' : String(v);
      el.classList.remove('show-phase');
    }

    // Anime.js drives the number pop (replaces CSS count-pop keyframe)
    if (v !== '') animateCountdownTick(el, isShow);

    // Ring shockwave — stays CSS-driven
    if (ring && v !== '') {
      ring.classList.remove('fire');
      ring.offsetHeight; // reflow to restart animation
      ring.classList.add('fire');
    }
  }

  showResult(label: string, type: 'win' | 'lose' | 'draw'): void {
    const el = this.resultEl;
    el.textContent = label;
    el.className = `result-display ${type}`;
    el.classList.remove('hidden');
    // Hide the countdown completely so SHOOT! can't overlap the result text
    this.countdownEl.classList.add('hidden');
    this.countdownEl.textContent = '';
    this.countdownEl.classList.remove('show-phase');
    // Anime.js drives the entrance (CSS class sets colour + glow, not animation)
    animateResultIn(el, type);
  }

  hideResult(): void {
    this.resultEl.classList.add('hidden');
    this.hideRevealPanel();
  }

  setPhaseHint(text: string): void {
    this.phaseHintEl.textContent = text;
  }

  flashScreen(): void {
    this.flashOverlay.classList.add('active');
    setTimeout(() => this.flashOverlay.classList.remove('active'), 120);
  }

  /** Briefly show the captured gesture so the player gets unmistakable
   *  confirmation of what was locked in at the SHOOT moment.
   *  gesture: the gesture that was captured (rock|paper|scissors|none). */
  showLockedIn(gesture: Gesture): void {
    const el = this.root.querySelector('#locked-in-display') as HTMLElement;
    const emoji = GESTURE_EMOJI[gesture] ?? '?';
    const label = gesture === 'none' ? 'NO HAND' : 'LOCKED';
    el.innerHTML = `<span class="locked-emoji">${emoji}</span><span class="locked-label">${label}</span>`;
    el.classList.remove('hidden');
    // restart the CSS animation by reflowing
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  hideLockedIn(): void {
    (this.root.querySelector('#locked-in-display') as HTMLElement).classList.add('hidden');
  }

  // ─── Gesture indicator (bottom pill) ─────────

  showGestureIndicator(): void { /* gesture pill is always visible in bottombar */ }
  hideGestureIndicator(): void { /* no-op */ }

  updateGesture(gesture: Gesture, p2Gesture?: Gesture): void {
    if (gesture === 'none') {
      this.gestureNameEl.textContent = '–';
      this.gesturePillEl.classList.remove('active');
      this.setGestureHint('No hand detected');
    } else {
      this.gestureNameEl.textContent = `${GESTURE_EMOJI[gesture]} ${gesture.toUpperCase()}`;
      this.gesturePillEl.classList.add('active');
      // Clear the stale "No hand detected" hint; hold ring will set its own hint when active
      if (this.hintTextEl.textContent === 'No hand detected') {
        this.hintTextEl.textContent = '';
      }
    }

    if (p2Gesture !== undefined) {
      this.gestureP2El.style.display = 'inline';
      this.gestureP2El.textContent = p2Gesture === 'none'
        ? ''
        : `  ·  P2: ${GESTURE_EMOJI[p2Gesture]} ${p2Gesture.toUpperCase()}`;
    } else {
      this.gestureP2El.style.display = 'none';
    }
  }

  setGestureHint(text: string): void {
    this.hintTextEl.textContent = text;
  }

  // ─── Leaderboard ─────────────────────────────

  /**
   * Show the leaderboard.
   * @param subtitle Which game mode this leaderboard is for, e.g.
   *   "Player vs CPU" or "Online Competition". Shown beneath the title
   *   so users know which mode produced these scores.
   */
  showLeaderboard(entries: LeaderboardEntry[], currentName = '', subtitle = 'Player vs CPU'): void {
    this.show(this.leaderboard);
    const subtitleEl = this.root.querySelector('#leaderboard-subtitle') as HTMLElement;
    if (subtitleEl) subtitleEl.textContent = subtitle;
    this.renderLeaderboardList(entries, currentName);
  }

  showLeaderboardWithTabs(
    pvcEntries: LeaderboardEntry[],
    onlineEntries: LeaderboardEntry[],
    currentName = '',
  ): void {
    this.show(this.leaderboard);
    const titleEl    = this.root.querySelector('#leaderboard-title') as HTMLElement;
    const subtitleEl = this.root.querySelector('#leaderboard-subtitle') as HTMLElement;
    const tabsEl     = this.root.querySelector('#lb-tabs') as HTMLElement;

    titleEl.innerHTML = `${ICON_TROPHY} Leaderboard`; // static trusted string, no user input
    subtitleEl.classList.add('hidden');
    tabsEl.classList.remove('hidden');

    const renderTab = (tab: 'pvc' | 'online') => {
      this.renderLeaderboardList(tab === 'pvc' ? pvcEntries : onlineEntries, currentName);
      tabsEl.querySelectorAll<HTMLElement>('.lb-tab').forEach((btn) =>
        btn.classList.toggle('active', btn.dataset['tab'] === tab),
      );
    };

    renderTab('pvc');
    tabsEl.querySelectorAll<HTMLButtonElement>('.lb-tab').forEach((btn) => {
      btn.onclick = () => renderTab(btn.dataset['tab'] as 'pvc' | 'online');
    });
  }

  private renderLeaderboardList(entries: LeaderboardEntry[], currentName: string): void {
    const list = this.root.querySelector('#leaderboard-list')!;
    list.innerHTML = '';

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lb-empty';
      const strong = document.createElement('strong');
      strong.textContent = 'No streaks yet';
      empty.appendChild(strong);
      const iconSpan = document.createElement('span');
      iconSpan.className = 'icon-inline-sm';
      iconSpan.innerHTML = ICON_FIRE; // static trusted markup, no user input
      empty.appendChild(document.createTextNode(' Be the first to set a record '));
      empty.appendChild(iconSpan);
      list.appendChild(empty);
      return;
    }

    entries.slice(0, 8).forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'lb-entry' + (e.name === currentName ? ' current-player' : '');

      const rank = document.createElement('span');
      rank.className = 'lb-rank';
      rank.textContent = String(i + 1);

      const name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = e.name;

      const streak = document.createElement('span');
      streak.className = 'lb-streak';
      streak.title = 'Best streak';
      // consecutiveWins is a server-controlled number, never user text — safe via innerHTML
      streak.innerHTML = `${e.consecutiveWins}<span class="icon-inline-sm">${ICON_FIRE}</span>`;

      row.append(rank, name, streak);
      list.appendChild(row);
    });
  }

  /** Shows the leaderboard modal immediately with a loading spinner —
   *  call before awaiting the API so the user sees feedback while the
   *  server (possibly cold) wakes up. */
  showLeaderboardLoading(subtitle = 'Player vs CPU'): void {
    this.show(this.leaderboard);
    const subtitleEl = this.root.querySelector('#leaderboard-subtitle') as HTMLElement;
    if (subtitleEl) subtitleEl.textContent = subtitle;
    const list = this.root.querySelector('#leaderboard-list')!;
    list.innerHTML = `
      <div class="lb-loading">
        <div class="spinner" aria-hidden="true"></div>
        <div>Loading leaderboard…</div>
      </div>`;
  }

  hideLeaderboard(): void {
    this.hide(this.leaderboard);
    // Reset tab state so non-tabbed in-game leaderboard popup is clean
    const subtitleEl = this.root.querySelector('#leaderboard-subtitle') as HTMLElement;
    subtitleEl.classList.remove('hidden');
    const tabsEl = this.root.querySelector('#lb-tabs') as HTMLElement;
    tabsEl.classList.add('hidden');
    const titleEl = this.root.querySelector('#leaderboard-title') as HTMLElement;
    titleEl.innerHTML = `${ICON_FIRE} Top Streaks`; // static trusted string, no user input
  }

  private _toastTimer?: ReturnType<typeof setTimeout>;

  showToast(message: string, durationMs = 2500): void {
    const el = this.root.querySelector('#toast') as HTMLElement;
    el.textContent = message;
    el.classList.remove('hidden', 'toast-fade');
    // Restart CSS animation
    void el.offsetHeight;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.add('toast-fade');
      setTimeout(() => el.classList.add('hidden'), 400);
    }, durationMs);
  }

  onLeaderboardClose(cb: () => void): void {
    this.root.querySelector('#leaderboard-close')!.addEventListener('click', cb);
  }

  // ─── Name Modal ───────────────────────────────

  /**
   * Prompts for a name. Resolves with the entered name, or `null` if the
   * user cancelled (clicked Cancel or pressed Escape).
   */
  promptName(): Promise<string | null> {
    this.show(this.nameModal);
    const input  = this.root.querySelector('#player-name-input') as HTMLInputElement;
    const okBtn  = this.root.querySelector('#name-submit') as HTMLButtonElement;
    const cancel = this.root.querySelector('#name-cancel') as HTMLButtonElement;
    input.value = '';
    input.focus();

    return new Promise((resolve) => {
      const finish = (result: string | null) => {
        this.hide(this.nameModal);
        okBtn.onclick = null;
        cancel.onclick = null;
        input.onkeydown = null;
        resolve(result);
      };
      okBtn.onclick   = () => finish(input.value.trim() || 'Player');
      cancel.onclick  = () => finish(null);
      input.onkeydown = (e) => {
        if (e.key === 'Enter')  finish(input.value.trim() || 'Player');
        if (e.key === 'Escape') finish(null);
      };
    });
  }

  // ─── Game Over modal ─────────────────────────

  /**
   * Show the Game Over modal and resolve with the user's choice.
   * Pass streak > 0 to display the streak summary.
   */
  promptGameOver(streak: number, isPersonalBest = false): Promise<'play-again' | 'menu'> {
    const modal     = this.root.querySelector('#game-over-modal') as HTMLElement;
    const numEl     = this.root.querySelector('#go-streak-num') as HTMLElement;
    const labelEl   = this.root.querySelector('#go-streak-label') as HTMLElement;
    const pbBadge   = this.root.querySelector('#go-pb-badge') as HTMLElement;
    const flameWrap = this.root.querySelector('#go-flame-wrap') as HTMLElement;
    const restartBtn = this.root.querySelector('#game-over-restart') as HTMLButtonElement;
    const menuBtn    = this.root.querySelector('#game-over-menu') as HTMLButtonElement;

    numEl.textContent = String(streak);
    labelEl.textContent = streak > 0 ? 'WIN STREAK' : 'BETTER LUCK NEXT TIME';
    // Cold (grey) flame when the run ended with nothing to celebrate
    flameWrap.classList.toggle('cold', streak === 0);
    pbBadge.classList.toggle('hidden', !isPersonalBest);

    this.show(modal);

    return new Promise((resolve) => {
      const finish = (choice: 'play-again' | 'menu') => {
        this.hide(modal);
        restartBtn.onclick = null;
        menuBtn.onclick = null;
        resolve(choice);
      };
      restartBtn.onclick = () => finish('play-again');
      menuBtn.onclick    = () => finish('menu');
    });
  }

  // ─── Connecting overlay ──────────────────────

  showConnecting(text = 'Connecting…'): void {
    (this.root.querySelector('#connecting-text') as HTMLElement).textContent = text;
    this.show(this.connectingOverlay);
  }

  hideConnecting(): void { this.hide(this.connectingOverlay); }

  // ─── Hold-to-confirm ring ─────────────────────

  private static readonly HOLD_CIRC = 2 * Math.PI * 22; // r=22 → 138.23

  /** progress: 0–1. gesture: current held gesture or null */
  updateHoldRing(progress: number, gesture: Gesture | null): void {
    if (gesture && progress > 0) {
      this.holdRingWrap.classList.add('visible');
      this.holdRingFill.style.strokeDashoffset =
        String(UI.HOLD_CIRC * (1 - progress));
      this.setGestureHint(progress >= 1 ? 'Locked in!' : 'Hold to confirm…');
    } else {
      this.holdRingWrap.classList.remove('visible');
      this.holdRingFill.style.strokeDashoffset = String(UI.HOLD_CIRC);
    }
  }

  // ─── CPU panel ───────────────────────────────

  /** emoji: the gesture emoji or '❓'. state: '' | 'win' | 'lose' | 'draw' */
  setCPUGesture(emoji: string, state: '' | 'win' | 'lose' | 'draw'): void {
    this.cpuEmojiEl.textContent = emoji;
    this.cpuPanelEl.className = state ? `cpu-${state}` : '';
  }

  // ─── Side-by-side reveal panel ────────────────

  showRevealPanel(p1g: Gesture, p2g: Gesture, winner: 0 | 1 | 2, p2Label = 'CPU'): void {
    // Clear SHOOT! regardless of which mode triggered reveal (PvP Online has no phase-change)
    this.countdownEl.classList.add('hidden');
    this.countdownEl.textContent = '';
    this.countdownEl.classList.remove('show-phase');

    this.revealP1Emoji.textContent = GESTURE_EMOJI[p1g] ?? '?';
    this.revealP2Emoji.textContent = GESTURE_EMOJI[p2g] ?? '?';
    (this.root.querySelector('#reveal-p1-label') as HTMLElement).textContent =
      this.p1NameEl.textContent ?? 'YOU';
    (this.root.querySelector('#reveal-p2-label') as HTMLElement).textContent = p2Label;

    this.revealP1Slot.classList.toggle('winner', winner === 1);
    this.revealP1Slot.classList.toggle('loser',  winner === 2);
    this.revealP2Slot.classList.toggle('winner', winner === 2);
    this.revealP2Slot.classList.toggle('loser',  winner === 1);

    // Verdict text sits under the cards as part of the same panel
    const verdictEl = this.root.querySelector('#reveal-verdict') as HTMLElement;
    const verdict =
      winner === 0 ? 'DRAW' :
      winner === 1 ? 'YOU WIN' :
                     `${p2Label} WINS`;
    verdictEl.textContent = verdict;
    verdictEl.className = `reveal-verdict ${winner === 0 ? 'draw' : winner === 1 ? 'win' : 'lose'}`;

    this.revealPanel.classList.add('visible');
  }

  hideRevealPanel(): void {
    this.revealPanel.classList.remove('visible');
  }

  // ─── Private helpers ─────────────────────────

  private show(el: HTMLElement): void  { el.classList.remove('hidden'); }
  private hide(el: HTMLElement): void  { el.classList.add('hidden'); }

}
