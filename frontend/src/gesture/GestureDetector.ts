import {
  HandLandmarker,
  type HandLandmarkerResult,
  FilesetResolver,
} from '@mediapipe/tasks-vision';
import type { Gesture, HandResult } from '../types.js';

// Finger bone connections for drawing the hand skeleton
const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],       // thumb
  [0,5],[5,6],[6,7],[7,8],       // index
  [0,9],[9,10],[10,11],[11,12],  // middle
  [0,13],[13,14],[14,15],[15,16],// ring
  [0,17],[17,18],[18,19],[19,20],// pinky
  [5,9],[9,13],[13,17],          // palm knuckles
];

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// MediaPipe landmark indices
const FINGER_TIPS = [8, 12, 16, 20] as const;
const FINGER_PIPS = [6, 10, 14, 18] as const;

type NLM = { x: number; y: number; z: number };

function isFingerExtended(lm: NLM[], tip: number, pip: number): boolean {
  // y increases downward in image space — tip above pip means extended
  return lm[tip].y < lm[pip].y;
}

function classifyGesture(landmarks: NLM[]): Gesture {
  const extended = FINGER_TIPS.map((tip, i) =>
    isFingerExtended(landmarks, tip, FINGER_PIPS[i])
  );
  const count = extended.filter(Boolean).length;

  if (count === 0) return 'rock';
  if (count >= 3) return 'paper';
  if (extended[0] && extended[1] && !extended[2] && !extended[3]) return 'scissors';
  return 'none';
}

/** Rolling buffer — returns stable gesture once 60% of recent frames agree */
class StabilityBuffer {
  private buf: Gesture[] = [];
  constructor(private size = 6) {}

  push(g: Gesture): Gesture {
    this.buf.push(g);
    if (this.buf.length > this.size) this.buf.shift();

    const counts: Record<Gesture, number> = { rock: 0, paper: 0, scissors: 0, none: 0 };
    for (const v of this.buf) counts[v]++;
    const [[bestKey, bestCount]] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const best = bestKey as Gesture;
    return bestCount >= Math.ceil(this.size * 0.6) && best !== 'none' ? best : 'none';
  }

  clear() { this.buf = []; }
}

export class GestureDetector {
  private landmarker: HandLandmarker | null = null;
  private lastTs = -1;
  private readonly buffers = { Left: new StabilityBuffer(), Right: new StabilityBuffer() };
  private _ready = false;

  get ready() { return this._ready; }

  async init(maxHands = 2): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

    const opts = {
      numHands: maxHands,
      runningMode: 'VIDEO' as const,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.5,
    };

    // Try GPU first (faster), fall back to CPU for compatibility
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        ...opts,
      });
    } catch {
      console.warn('[GestureDetector] GPU delegate failed — retrying with CPU');
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        ...opts,
      });
    }

    this._ready = true;
  }

  /** Call once per animation frame with current video element + timestamp */
  detect(video: HTMLVideoElement): HandResult[] {
    if (!this.landmarker || !this._ready) return [];
    if (video.readyState < 2) return [];

    const ts = performance.now();
    if (ts === this.lastTs) return [];
    this.lastTs = ts;

    let raw: HandLandmarkerResult;
    try {
      raw = this.landmarker.detectForVideo(video, ts);
    } catch {
      this.lastRaw = null;
      return [];
    }
    this.lastRaw = raw;

    const results: HandResult[] = [];

    for (let i = 0; i < raw.landmarks.length; i++) {
      const handedness = (raw.handedness[i]?.[0]?.displayName ?? 'Right') as 'Left' | 'Right';
      const rawGesture = classifyGesture(raw.landmarks[i] as NLM[]);
      const stable = this.buffers[handedness].push(rawGesture);
      const confidence = raw.handedness[i]?.[0]?.score ?? 0;

      results.push({ gesture: stable, handedness, confidence });
    }

    // Reset buffers for hands not currently visible
    const seen = new Set(results.map((r) => r.handedness));
    for (const side of ['Left', 'Right'] as const) {
      if (!seen.has(side)) this.buffers[side].clear();
    }

    return results;
  }

  /** Snapshot a single locked-in gesture for the specified hand */
  snapshot(hands: HandResult[], side: 'Left' | 'Right' | 'any'): Gesture {
    if (side === 'any') {
      // Return first non-none gesture regardless of hand
      return hands.find((h) => h.gesture !== 'none')?.gesture ?? 'none';
    }
    return hands.find((h) => h.handedness === side)?.gesture ?? 'none';
  }

  /**
   * Draw hand skeleton on a canvas overlay.
   * `raw` comes from the last detectForVideo call (stored each frame).
   * `mirrored` should match the CSS transform on the video element.
   */
  drawLandmarks(canvas: HTMLCanvasElement, raw: HandLandmarkerResult | null, mirrored = true): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

    if (!raw || raw.landmarks.length === 0) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const mx = (x: number) => mirrored ? (1 - x) * W : x * W;
    const my = (y: number) => y * H;

    // Layered strokes give a glow look without shadowBlur (which is the
    // single biggest canvas perf killer — each blur forces a full off-screen
    // composite). The 'lighter' composite makes overlaps brighten naturally.
    const prevComposite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const lms of raw.landmarks) {
      // ─── Bones: 2 wide soft passes + 1 bright core (no shadowBlur) ──
      const passes = [
        { width: 10, color: 'rgba(62,255,216,0.18)' },  // soft halo
        { width: 4,  color: 'rgba(62,255,216,0.55)' },  // mid glow
        { width: 1.5, color: 'rgba(220,255,250,0.95)' }, // bright core
      ];
      for (const p of passes) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth   = p.width;
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.moveTo(mx(lms[a].x), my(lms[a].y));
          ctx.lineTo(mx(lms[b].x), my(lms[b].y));
        }
        ctx.stroke();
      }

      // ─── Joints: soft halo + bright core, no shadowBlur ──────────
      ctx.fillStyle = 'rgba(62,255,216,0.4)';
      for (const lm of lms) {
        ctx.beginPath();
        ctx.arc(mx(lm.x), my(lm.y), 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(240,255,253,1)';
      for (const lm of lms) {
        ctx.beginPath();
        ctx.arc(mx(lm.x), my(lm.y), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = prevComposite;
  }

  /** The last raw result, stored by detect() for drawLandmarks(). */
  lastRaw: HandLandmarkerResult | null = null;

  dispose() {
    this.landmarker?.close();
    this.landmarker = null;
    this._ready = false;
  }
}
