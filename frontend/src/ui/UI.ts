import type { Gesture, LeaderboardEntry, GameMode } from '../types.js';
import { ICON_CPU, ICON_DUEL, ICON_CROWN } from './icons.js';
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
  private modeSelect!: HTMLElement;
  private gameHud!: HTMLElement;
  private gestureIndicator!: HTMLElement;
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

  constructor(rootId = 'ui-root') {
    this.root = document.getElementById(rootId)!;
    this.root.innerHTML = this.buildHTML();
    this.cacheRefs();
  }

  private buildHTML(): string {
    return `
<!-- Loading screen -->
<div id="loading-screen">
  <div class="loading-title">HAND DUEL</div>
  <div class="loading-dots"><span></span><span></span><span></span><span></span><span></span></div>
  <div class="loading-status" id="loading-status">Loading gesture detection…</div>
</div>

<!-- Mode Select -->
<div id="mode-select" class="screen hidden">
  <div class="game-title">HAND DUEL</div>
  <div class="game-subtitle">Rock · Paper · Scissors</div>
  <div class="mode-grid">
    <button class="mode-btn" data-mode="pvc">
      <div class="mode-icon">${ICON_CPU}</div>
      <div class="mode-name">Player vs CPU</div>
      <div class="mode-desc">Challenge the machine</div>
    </button>
    <button class="mode-btn" data-mode="pvp-local">
      <div class="mode-icon">${ICON_DUEL}</div>
      <div class="mode-name">Local PvP</div>
      <div class="mode-desc">Left hand vs Right hand</div>
    </button>
    <button class="mode-btn" data-mode="pvp-online">
      <div class="mode-icon">${ICON_CROWN}</div>
      <div class="mode-name">Competition</div>
      <div class="mode-desc">Online · streak leaderboard</div>
    </button>
  </div>
</div>

<!-- Game HUD -->
<div id="game-hud" class="screen hidden">
  <div class="hud-top">
    <div class="player-panel p1">
      <div class="player-name" id="p1-name">YOU</div>
      <div class="player-score p1" id="p1-score">0</div>
    </div>
    <div class="hud-center-top">
      <div class="round-label" id="round-display">ROUND 1</div>
      <div class="wins-label" id="wins-label">First to 2 wins</div>
    </div>
    <div class="player-panel p2" style="align-items:flex-end">
      <div class="player-name" id="p2-name">CPU</div>
      <div class="player-score p2" id="p2-score">0</div>
    </div>
  </div>

  <div class="hud-arena">
    <div class="countdown-ring" id="countdown-ring"></div>
    <div class="countdown-display" id="countdown-display"></div>
    <div class="result-display hidden" id="result-display"></div>
    <div class="phase-hint" id="phase-hint">Get ready…</div>
  </div>

  <div style="height:48px"></div>
  <button class="back-btn" id="back-btn">← Menu</button>
</div>

<!-- Gesture indicator (bottom center) -->
<div id="gesture-indicator" class="hidden">
  <div class="dot"></div>
  <span id="gesture-name">–</span>
  <span id="gesture-p2" style="display:none">  |  P2: <span id="gesture-p2-val">–</span></span>
</div>

<!-- Leaderboard (online competition) -->
<div id="leaderboard" class="hidden">
  <h3>🔥 Top Streaks</h3>
  <div id="leaderboard-list"></div>
</div>

<!-- Name entry modal -->
<div id="name-modal" class="hidden">
  <div class="modal-box">
    <h2>Enter your name</h2>
    <p>You'll be shown on the global leaderboard</p>
    <input id="player-name-input" type="text" maxlength="16" placeholder="Your name…" autocomplete="off" />
    <button class="submit-btn" id="name-submit">Join Competition</button>
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
    this.modeSelect          = this.root.querySelector('#mode-select')!;
    this.gameHud             = this.root.querySelector('#game-hud')!;
    this.gestureIndicator    = this.root.querySelector('#gesture-indicator')!;
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
    this.show(this.gameHud);
    this.p1NameEl.textContent = p1Name;
    this.p2NameEl.textContent = p2Name;
    this.showGestureIndicator();
    this.setCountdown('');
    this.hideResult();
    this.setPhaseHint('Get ready…');
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

  // ─── HUD updates ─────────────────────────────

  setScore(p1: number, p2: number): void {
    this.p1ScoreEl.textContent = String(p1);
    this.p2ScoreEl.textContent = String(p2);
  }

  pulseScore(player: 1 | 2): void {
    const el = player === 1 ? this.p1ScoreEl : this.p2ScoreEl;
    el.classList.remove('pulse');
    el.offsetHeight; // reflow
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 600);
  }

  setRound(n: number): void {
    this.roundEl.textContent = `ROUND ${n}`;
  }

  setCountdown(v: number | string): void {
    const el   = this.countdownEl;
    const ring = this.root.querySelector('#countdown-ring') as HTMLElement | null;
    const isShow = v === 0 || v === '0';

    if (isShow) {
      el.textContent = 'SHOW!';
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
    this.setCountdown('');
    // Anime.js drives the entrance (CSS class sets colour + glow, not animation)
    animateResultIn(el, type);
  }

  hideResult(): void {
    this.resultEl.classList.add('hidden');
  }

  setPhaseHint(text: string): void {
    this.phaseHintEl.textContent = text;
  }

  flashScreen(): void {
    this.flashOverlay.classList.add('active');
    setTimeout(() => this.flashOverlay.classList.remove('active'), 120);
  }

  // ─── Gesture indicator ────────────────────────

  showGestureIndicator(): void { this.gestureIndicator.classList.remove('hidden'); }
  hideGestureIndicator(): void { this.gestureIndicator.classList.add('hidden'); }

  updateGesture(gesture: Gesture, p2Gesture?: Gesture): void {
    const el = this.gestureIndicator;
    this.gestureNameEl.textContent =
      gesture === 'none' ? '–' : `${GESTURE_EMOJI[gesture]} ${gesture}`;

    if (p2Gesture !== undefined) {
      this.gestureP2El.style.display = 'inline';
      const p2ValEl = this.root.querySelector('#gesture-p2-val')!;
      p2ValEl.textContent = p2Gesture === 'none' ? '–' : `${GESTURE_EMOJI[p2Gesture]} ${p2Gesture}`;
    } else {
      this.gestureP2El.style.display = 'none';
    }

    el.classList.remove('no-hand', 'gesture-rock', 'gesture-paper', 'gesture-scissors');
    if (gesture === 'none') {
      el.classList.add('no-hand');
    } else {
      el.classList.add(`gesture-${gesture}`);
    }
  }

  // ─── Leaderboard ─────────────────────────────

  showLeaderboard(entries: LeaderboardEntry[], currentName = ''): void {
    this.show(this.leaderboard);
    const list = this.root.querySelector('#leaderboard-list')!;
    list.innerHTML = entries
      .slice(0, 8)
      .map(
        (e, i) => `
        <div class="lb-entry${e.name === currentName ? ' current-player' : ''}">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${this.escape(e.name)}</span>
          <span class="lb-streak" title="Best streak">${e.consecutiveWins}🔥</span>
        </div>`
      )
      .join('');
  }

  hideLeaderboard(): void { this.hide(this.leaderboard); }

  // ─── Name Modal ───────────────────────────────

  promptName(): Promise<string> {
    this.show(this.nameModal);
    const input = this.root.querySelector('#player-name-input') as HTMLInputElement;
    const btn   = this.root.querySelector('#name-submit') as HTMLButtonElement;
    input.value = '';
    input.focus();

    return new Promise((resolve) => {
      const submit = () => {
        const name = input.value.trim() || 'Player';
        this.hide(this.nameModal);
        resolve(name);
      };
      btn.onclick = submit;
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    });
  }

  // ─── Connecting overlay ──────────────────────

  showConnecting(text = 'Connecting…'): void {
    (this.root.querySelector('#connecting-text') as HTMLElement).textContent = text;
    this.show(this.connectingOverlay);
  }

  hideConnecting(): void { this.hide(this.connectingOverlay); }

  // ─── Private helpers ─────────────────────────

  private show(el: HTMLElement): void  { el.classList.remove('hidden'); }
  private hide(el: HTMLElement): void  { el.classList.add('hidden'); }

  private escape(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
