import * as THREE from 'three';
import type { Gesture, RoundWinner } from '../types.js';

const P1_COLOR = 0x0088ff;
const P2_COLOR = 0xff4422;
const ARENA_W = 8;

export class GameScene {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  // Ambient particles
  private particles!: THREE.Points;
  private particleVels!: Float32Array;

  // Screen-shake state
  private shakeIntensity = 0;
  private cameraBasePos = new THREE.Vector3(0, 1.5, 8);


  init(canvas: HTMLCanvasElement, _p1Video?: HTMLVideoElement): void {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x03030d, 0.04);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 80);
    this.camera.position.copy(this.cameraBasePos);
    this.camera.lookAt(0, 0, 0);

    this.buildArena();
    this.buildParticles();
    this.buildLighting();

    window.addEventListener('resize', this.onResize);
  }

  // ─── Arena: intentionally empty ────────────────
  // Removed grid + horizon + center divider so the camera feed reads as the
  // hero. Gesture reveals are now handled by 2D HUD cards. Only the ambient
  // particle field remains for atmosphere.
  private buildArena(): void { /* no-op */ }

  // ─── Ambient particle field ────────────────────
  private buildParticles(): void {
    const N = 1500;
    const pos = new Float32Array(N * 3);
    this.particleVels = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 15;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
      this.particleVels[i * 3]     = (Math.random() - 0.5) * 0.002;
      this.particleVels[i * 3 + 1] = (Math.random() - 0.5) * 0.001;
      this.particleVels[i * 3 + 2] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.025, color: 0x3366ff, transparent: true, opacity: 0.5 })
    );
    this.scene.add(this.particles);
  }

  private buildLighting(): void {
    this.scene.add(new THREE.AmbientLight(0x111133, 0.8));

    const p1L = new THREE.PointLight(P1_COLOR, 3, 12);
    p1L.position.set(-(ARENA_W / 2), 2, 3);
    this.scene.add(p1L);

    const p2L = new THREE.PointLight(P2_COLOR, 3, 12);
    p2L.position.set(ARENA_W / 2, 2, 3);
    this.scene.add(p2L);

    const centerL = new THREE.PointLight(0xffffff, 1.5, 8);
    centerL.position.set(0, 3, 2);
    this.scene.add(centerL);
  }

  // ─── Public API ───────────────────────────────

  setP2Video(_video: HTMLVideoElement): void { /* webcam planes removed */ }
  resetP2Video(): void { /* webcam planes removed */ }

  // Gesture meshes removed — the 2D reveal panel handles gesture display.
  // These remain as no-ops so the rest of the app's wiring stays intact.
  showGestures(_p1: Gesture, _p2: Gesture): void { /* no-op */ }

  highlightWinner(winner: RoundWinner): void {
    if (winner !== 0) this.shakeIntensity = 0.12;
  }

  clearGestures(): void { /* no-op */ }

  triggerShake(intensity = 0.08): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  // ─── Animation loop ──────────────────────────
  update(dt: number): void {
    this.animateParticles(dt);

    // Camera shake decay
    if (this.shakeIntensity > 0.001) {
      this.shakeIntensity *= 0.88;
      this.camera.position.set(
        this.cameraBasePos.x + (Math.random() - 0.5) * this.shakeIntensity,
        this.cameraBasePos.y + (Math.random() - 0.5) * this.shakeIntensity,
        this.cameraBasePos.z
      );
    } else {
      this.shakeIntensity = 0;
      this.camera.position.copy(this.cameraBasePos);
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ─── Helpers ─────────────────────────────────

  private animateParticles(dt: number): void {
    const pos = (this.particles.geometry.attributes['position'] as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < pos.length / 3; i++) {
      pos[i * 3]     += this.particleVels[i * 3];
      pos[i * 3 + 1] += this.particleVels[i * 3 + 1];
      // Wrap
      if (pos[i * 3] > 15) pos[i * 3] = -15;
      if (pos[i * 3] < -15) pos[i * 3] = 15;
      if (pos[i * 3 + 1] > 7) pos[i * 3 + 1] = -7;
    }
    (this.particles.geometry.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
    this.particles.rotation.y += dt * 0.005;
  }

  private onResize = (): void => {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
