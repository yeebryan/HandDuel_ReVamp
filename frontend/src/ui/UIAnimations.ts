/**
 * UIAnimations — Anime.js v4 choreography for HandDuel UI.
 *
 * CSS owns:  card lift/shadow on hover, ring shockwave, flash, loading dots,
 *            result colour/glow classes, reduced-motion collapse.
 * This file: SVG path-draw on entrance, card stagger, icon spring hover,
 *            countdown pop, result fly-in, loading screen exit.
 */
import {
  animate,
  stagger,
  set,
  remove,
  createDrawable,
  spring,
} from 'animejs';

// ─── Duration constants (mirrors CSS --dur-* tokens) ──────────────────────────
export const DUR_MICRO = 100;
export const DUR_SHORT = 220;
export const DUR_BASE  = 320;
export const DUR_LONG  = 480;

// ─── Mode-select entrance ─────────────────────────────────────────────────────

/**
 * Stagger the three mode cards up from below, then trace each icon's SVG
 * paths tier-by-tier (icon-a shell → icon-b detail → icon-c accents).
 */
export function animateModeSelectIn(container: HTMLElement): void {
  const cards = Array.from(container.querySelectorAll<HTMLElement>('.mode-btn'));
  if (!cards.length) return;

  // ① Park cards off-screen
  set(cards, { opacity: 0, translateY: 28, scale: 0.94 });

  // ② Stagger cards upward
  animate(cards, {
    opacity:    [0, 1],
    translateY: [28, 0],
    scale:      [0.94, 1],
    delay:      stagger(90, { start: 60 }),
    ease:       'outExpo',
    duration:   700,
  });

  // ③ Per-card SVG path draw, tier by tier
  cards.forEach((card, cardIdx) => {
    const tiers = [
      Array.from(card.querySelectorAll<SVGGeometryElement>('.icon-a')),
      Array.from(card.querySelectorAll<SVGGeometryElement>('.icon-b')),
      Array.from(card.querySelectorAll<SVGGeometryElement>('.icon-c')),
    ];

    let tierStart = 240 + cardIdx * 100;

    tiers.forEach((els) => {
      if (!els.length) return;
      try {
        // createDrawable initialises each element at 0% drawn
        const drawables = createDrawable(els, 0, 0);
        animate(drawables, {
          draw:     '0 1',
          delay:    stagger(60, { start: tierStart }),
          ease:     'outSine',
          duration: 520,
        });
      } catch (e) {
        console.warn('[UIAnimations] SVG draw failed — skipping tier:', e);
      }
      tierStart += els.length * 60 + 40;
    });
  });
}

// ─── Icon hover spring ────────────────────────────────────────────────────────

/**
 * Attach mouseenter / mouseleave spring physics to each mode card's SVG icon.
 * Call once after the mode-select HTML is in the DOM.
 */
export function attachIconHover(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('.mode-btn').forEach((card) => {
    const svg = card.querySelector<HTMLElement>('.mode-svg');
    if (!svg) return;

    card.addEventListener('mouseenter', () => {
      remove(svg);
      animate(svg, {
        scale:    1.2,
        rotate:   7,
        ease:     spring({ stiffness: 220, damping: 14, mass: 0.6 }),
        duration: 400,
      });
    });

    card.addEventListener('mouseleave', () => {
      remove(svg);
      animate(svg, {
        scale:    1,
        rotate:   0,
        ease:     'outSine',
        duration: DUR_SHORT,
      });
    });
  });
}

// ─── Countdown tick ───────────────────────────────────────────────────────────

/**
 * Scale-pop the countdown number on each tick.
 * `isShow` = true when the display reads "SHOW!" (accent colour phase).
 */
export function animateCountdownTick(
  el: HTMLElement,
  isShow: boolean,
): void {
  remove(el);
  animate(el, {
    scale:    [isShow ? 1.5 : 1.95, 1],
    opacity:  [0, 1],
    ease:     'outBack',
    duration: DUR_BASE,
  });
}

// ─── Result reveal ────────────────────────────────────────────────────────────

/**
 * Type-specific result entrance:
 *   win  → spring scale-pop (satisfying, emphatic)
 *   lose → spring lateral oscillation (communicates penalty)
 *   draw → fly-in from above (neutral)
 *
 * Call AFTER setting the text and outcome class on the element.
 */
export function animateResultIn(
  el: HTMLElement,
  type: 'win' | 'lose' | 'draw' = 'draw',
): void {
  remove(el);

  if (type === 'win') {
    set(el, { scale: 0.55, opacity: 0, translateX: 0, translateY: 0 });
    animate(el, {
      scale:    [0.55, 1],
      opacity:  [0, 1],
      ease:     spring({ stiffness: 260, damping: 16, mass: 0.7 }),
      duration: DUR_LONG,
    });
  } else if (type === 'lose') {
    set(el, { translateX: -20, opacity: 0, scale: 1, translateY: 0 });
    animate(el, {
      translateX: [-20, 0],
      opacity:    [0, 1],
      ease:       spring({ stiffness: 320, damping: 7, mass: 0.5 }),
      duration:   DUR_LONG,
    });
  } else {
    set(el, { translateY: -16, scale: 0.88, opacity: 0, translateX: 0 });
    animate(el, {
      translateY: [-16, 0],
      scale:      [0.88, 1],
      opacity:    [0, 1],
      ease:       'outExpo',
      duration:   DUR_LONG,
    });
  }
}

// ─── Loading screen exit ──────────────────────────────────────────────────────

/**
 * Fade + compress the loading screen out, then call `onDone` to hide it.
 */
export function animateLoadingOut(
  el: HTMLElement,
  onDone: () => void,
): void {
  animate(el, {
    opacity:    [1, 0],
    scale:      [1, 0.97],
    ease:       'inSine',
    duration:   360,
    onComplete: () => onDone(),
  });
}
