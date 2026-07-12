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

/**
 * Shared gradient defs for the solid "chrome" icon set below (robot, crown,
 * fire, trophy). Injected once into the DOM; every icon references the IDs
 * via fill="url(#...)". Gradient refs are global across the document, so
 * this only needs to be mounted once regardless of how many icons use it.
 */
export const ICON_GRADIENT_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <linearGradient id="hd-grad-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd54a"/><stop offset="1" stop-color="#ff7a1e"/>
    </linearGradient>
    <linearGradient id="hd-grad-blue" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7bd8ff"/><stop offset="1" stop-color="#2196d6"/>
    </linearGradient>
  </defs>
</svg>`;

/** PvC — solid robot glyph, blue gradient fill */
export const ICON_ROBOT_SOLID = `<svg class="mode-svg mode-svg-solid" viewBox="0 0 640 512"
  fill="url(#hd-grad-blue)" aria-hidden="true">
  <path d="M320 0c17.7 0 32 14.3 32 32V96H472c39.8 0 72 32.2 72 72V440c0 39.8-32.2 72-72 72H168c-39.8 0-72-32.2-72-72V168c0-39.8 32.2-72 72-72H288V32c0-17.7 14.3-32 32-32zM208 384c-8.8 0-16 7.2-16 16s7.2 16 16 16h32c8.8 0 16-7.2 16-16s-7.2-16-16-16H208zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16h32c8.8 0 16-7.2 16-16s-7.2-16-16-16H304zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16h32c8.8 0 16-7.2 16-16s-7.2-16-16-16H400zM264 256a40 40 0 1 0 -80 0 40 40 0 1 0 80 0zm152 40a40 40 0 1 0 0-80 40 40 0 1 0 0 80zM48 224H64V416H48c-26.5 0-48-21.5-48-48V272c0-26.5 21.5-48 48-48zm544 0c26.5 0 48 21.5 48 48v96c0 26.5-21.5 48-48 48H576V224h16z"/>
</svg>`;

/** Competition — solid crown glyph, gold gradient fill */
export const ICON_CROWN_SOLID = `<svg class="mode-svg mode-svg-solid" viewBox="0 0 576 512"
  fill="url(#hd-grad-gold)" aria-hidden="true">
  <path d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6H426.6c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/>
</svg>`;

/** Streak / hot-hand accent — solid fire glyph, gold gradient fill */
export const ICON_FIRE = `<svg class="icon-inline icon-fire" viewBox="0 0 448 512"
  fill="url(#hd-grad-gold)" aria-hidden="true">
  <path d="M159.3 5.4c7.8-7.3 19.9-7.2 27.7 .1c27.6 25.9 53.5 53.8 77.7 84c11-14.4 23.5-30.1 37-42.9c7.9-7.4 20.1-7.4 28 .1c34.6 33 63.9 76.6 84.5 118c20.3 40.8 33.8 82.5 33.8 111.9C448 404.2 348.2 512 224 512C98.4 512 0 404.1 0 276.5c0-38.4 17.8-85.3 45.4-131.7C73.3 97.7 112.7 48.6 159.3 5.4zM225.7 416c25.3 0 47.7-7 68.8-21c42.1-29.4 53.4-88.2 28.1-134.4c-4.5-9-16-9.6-22.5-2l-25.2 29.3c-6.6 7.6-18.5 7.4-24.7-.5c-16.5-21-46-58.5-62.8-79.8c-6.3-8-18.3-8.1-24.7-.1c-33.8 42.5-50.8 69.3-50.8 99.4C112 375.4 162.6 416 225.7 416z"/>
</svg>`;

/** Leaderboard / ranking accent — solid trophy glyph, gold gradient fill */
export const ICON_TROPHY = `<svg class="icon-inline icon-trophy" viewBox="0 0 576 512"
  fill="url(#hd-grad-gold)" aria-hidden="true">
  <path d="M400 0H176c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8H24C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9H192c-17.7 0-32 14.3-32 32s14.3 32 32 32H384c17.7 0 32-14.3 32-32s-14.3-32-32-32H357.9C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24H446.4c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112h84.4c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6h84.4c-5.1 66.3-31.1 111.2-63 142.3z"/>
</svg>`;
