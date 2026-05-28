/**
 * Stroke-based SVG icons for HandDuel mode selection.
 * All paths use currentColor so CSS tokens drive the colour.
 * Class suffixes (icon-a, icon-b, icon-c) control draw-order
 * for Anime.js staggered stroke-dashoffset animations.
 */

/** PvC — nested hexagons: outer shell + inner ring + 4 connector spurs */
export const ICON_CPU = `<svg class="mode-svg" viewBox="0 0 40 40" fill="none"
  stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true">
  <polygon points="20,3 33.5,11 33.5,29 20,37 6.5,29 6.5,11"
    class="icon-a"/>
  <polygon points="20,11.5 27.5,16 27.5,28 20,32 12.5,28 12.5,16"
    class="icon-b"/>
  <line x1="6.5"  y1="20" x2="12.5" y2="20" class="icon-c"/>
  <line x1="27.5" y1="20" x2="33.5" y2="20" class="icon-c"/>
  <line x1="20"   y1="3"  x2="20"   y2="11.5" class="icon-c"/>
  <line x1="20"   y1="32" x2="20"   y2="37"   class="icon-c"/>
</svg>`;

/** PvP Local — two figure silhouettes with a hairline divider between them */
export const ICON_DUEL = `<svg class="mode-svg" viewBox="0 0 40 40" fill="none"
  stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true">
  <circle cx="11" cy="11" r="4.5" class="icon-a"/>
  <path   d="M4 36 L4 23 Q4 18 11 18 Q18 18 18 23 L18 36" class="icon-b"/>
  <circle cx="29" cy="11" r="4.5" class="icon-a"/>
  <path   d="M22 36 L22 23 Q22 18 29 18 Q36 18 36 23 L36 36" class="icon-b"/>
  <line   x1="20" y1="7" x2="20" y2="37" class="icon-c"/>
</svg>`;

/** Competition — crown with three peaks, a base band and a centre jewel */
export const ICON_CROWN = `<svg class="mode-svg" viewBox="0 0 40 40" fill="none"
  stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true">
  <path d="M5 30 L5 14 L13.5 23 L20 7 L26.5 23 L35 14 L35 30 Z"
    class="icon-a"/>
  <rect x="5" y="32" width="30" height="4" rx="2" class="icon-b"/>
  <circle cx="20" cy="7" r="2.5" class="icon-c"/>
  <circle cx="5"  cy="14" r="1.8" class="icon-c"/>
  <circle cx="35" cy="14" r="1.8" class="icon-c"/>
</svg>`;
