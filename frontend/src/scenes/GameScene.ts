import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Gesture, RoundWinner } from '../types.js';

const P1_COLOR = 0x0088ff;
const P2_COLOR = 0xff4422;
const ARENA_W = 8;

export class GameScene {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;

  private p1VideoTex: THREE.VideoTexture | null = null;
  private p2VideoTex: THREE.VideoTexture | null = null;
  private p1CamMesh!: THREE.Mesh;
  private p2CamMesh!: THREE.Mesh;

  private p1Gesture: THREE.Object3D | null = null;
  private p2Gesture: THREE.Object3D | null = null;

  // Ambient particles
  private particles!: THREE.Points;
  private particleVels!: Float32Array;

  // Screen-shake state
  private shakeIntensity = 0;
  private cameraBasePos = new THREE.Vector3(0, 1.5, 8);

  // Gesture reveal animation
  private p1Scale = 0;
  private p2Scale = 0;
  private revealActive = false;

  // Pulse animation (winner)
  private winnerSide: RoundWinner = 0;
  private pulseT = 0;

  init(canvas: HTMLCanvasElement, p1Video: HTMLVideoElement): void {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03030d);
    this.scene.fog = new THREE.FogExp2(0x03030d, 0.04);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 80);
    this.camera.position.copy(this.cameraBasePos);
    this.camera.lookAt(0, 0, 0);

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.0, 0.3, 0.75
      )
    );

    this.buildArena();
    this.buildParticles();
    this.buildPlayerSlots(p1Video);
    this.buildLighting();

    window.addEventListener('resize', this.onResize);
  }

  // ─── Arena floor + grid ───────────────────────
  private buildArena(): void {
    const grid = new THREE.GridHelper(40, 40, 0x002244, 0x001133);
    grid.position.y = -2;
    this.scene.add(grid);

    // Glowing horizon line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-20, -2, 0),
      new THREE.Vector3(20, -2, 0),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x0044cc });
    this.scene.add(new THREE.Line(lineGeo, lineMat));

    // Center divider
    const divGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -2, -20),
      new THREE.Vector3(0, 3, -20),
      new THREE.Vector3(0, 3, 3),
      new THREE.Vector3(0, -2, 3),
    ]);
    const divMat = new THREE.LineBasicMaterial({ color: 0x333355, transparent: true, opacity: 0.5 });
    this.scene.add(new THREE.Line(divGeo, divMat));
  }

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

  // ─── Webcam planes + borders ──────────────────
  private buildPlayerSlots(p1Video: HTMLVideoElement): void {
    const w = 3.5, h = 2.6;
    const camGeo = new THREE.PlaneGeometry(w, h);

    // P1 — left, mirrored webcam
    this.p1VideoTex = new THREE.VideoTexture(p1Video);
    this.p1VideoTex.colorSpace = THREE.SRGBColorSpace;
    this.p1VideoTex.repeat.x = -1;
    this.p1VideoTex.offset.x = 1;

    const p1Mat = new THREE.MeshBasicMaterial({ map: this.p1VideoTex });
    this.p1CamMesh = new THREE.Mesh(camGeo, p1Mat);
    this.p1CamMesh.position.set(-(ARENA_W / 2), 0.5, 0);
    this.scene.add(this.p1CamMesh);

    // P2 — right, placeholder (dark)
    const p2Mat = new THREE.MeshBasicMaterial({ color: 0x0a0a1a });
    this.p2CamMesh = new THREE.Mesh(camGeo, p2Mat);
    this.p2CamMesh.position.set(ARENA_W / 2, 0.5, 0);
    this.scene.add(this.p2CamMesh);

    // Neon border frames
    this.addFrameBorder(-(ARENA_W / 2), 0.5, w, h, P1_COLOR);
    this.addFrameBorder(ARENA_W / 2, 0.5, w, h, P2_COLOR);
  }

  private addFrameBorder(x: number, y: number, w: number, h: number, color: number): void {
    const hw = w / 2, hh = h / 2;
    const pts = [
      new THREE.Vector3(-hw, -hh, 0.01),
      new THREE.Vector3(hw, -hh, 0.01),
      new THREE.Vector3(hw, hh, 0.01),
      new THREE.Vector3(-hw, hh, 0.01),
      new THREE.Vector3(-hw, -hh, 0.01),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    line.position.set(x, y, 0);
    this.scene.add(line);
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

  /** Assign a second webcam stream to the P2 slot */
  setP2Video(video: HTMLVideoElement): void {
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.x = -1;
    tex.offset.x = 1;
    this.p2VideoTex = tex;
    (this.p2CamMesh.material as THREE.MeshBasicMaterial).map = tex;
    (this.p2CamMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
  }

  resetP2Video(): void {
    this.p2VideoTex = null;
    (this.p2CamMesh.material as THREE.MeshBasicMaterial).map = null;
    (this.p2CamMesh.material as THREE.MeshBasicMaterial).color.setHex(0x0a0a1a);
    (this.p2CamMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
  }

  showGestures(p1: Gesture, p2: Gesture): void {
    this.clearGestures();
    this.p1Gesture = this.makeGestureMesh(p1, P1_COLOR);
    this.p1Gesture.position.set(-(ARENA_W / 2), -1.5, 0);
    this.p1Gesture.scale.setScalar(0);
    this.scene.add(this.p1Gesture);

    this.p2Gesture = this.makeGestureMesh(p2, P2_COLOR);
    this.p2Gesture.position.set(ARENA_W / 2, -1.5, 0);
    this.p2Gesture.scale.setScalar(0);
    this.scene.add(this.p2Gesture);

    this.p1Scale = 0;
    this.p2Scale = 0;
    this.revealActive = true;
    this.winnerSide = 0;
    this.pulseT = 0;
  }

  highlightWinner(winner: RoundWinner): void {
    this.winnerSide = winner;
    this.pulseT = 0;
    if (winner === 0) return;

    const win = winner === 1 ? this.p1Gesture : this.p2Gesture;
    const lose = winner === 1 ? this.p2Gesture : this.p1Gesture;

    if (win) this.setEmissiveIntensity(win, 1.4);
    if (lose) {
      this.setEmissiveIntensity(lose, 0);
      this.setColor(lose, 0x222233);
      lose.scale.setScalar(0.75);
    }
    this.shakeIntensity = 0.12;
  }

  clearGestures(): void {
    if (this.p1Gesture) { this.scene.remove(this.p1Gesture); this.p1Gesture = null; }
    if (this.p2Gesture) { this.scene.remove(this.p2Gesture); this.p2Gesture = null; }
    this.revealActive = false;
  }

  triggerShake(intensity = 0.08): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  // ─── Animation loop ──────────────────────────
  update(dt: number): void {
    this.animateParticles(dt);

    if (this.revealActive) {
      const speed = dt * 3.5;
      this.p1Scale = Math.min(1, this.p1Scale + speed);
      this.p2Scale = Math.min(1, this.p2Scale + speed);

      if (this.p1Gesture) {
        this.p1Gesture.scale.setScalar(this.easeOutBack(this.p1Scale));
        this.p1Gesture.rotation.y += dt * 1.8;
      }
      if (this.p2Gesture) {
        this.p2Gesture.scale.setScalar(this.easeOutBack(this.p2Scale));
        this.p2Gesture.rotation.y -= dt * 1.8;
      }
      if (this.p1Scale >= 1 && this.p2Scale >= 1) this.revealActive = false;
    }

    // Winner pulse
    if (this.winnerSide !== 0) {
      this.pulseT += dt * 4;
      const pulseMesh = this.winnerSide === 1 ? this.p1Gesture : this.p2Gesture;
      if (pulseMesh) {
        const s = 1 + Math.sin(this.pulseT) * 0.06;
        pulseMesh.scale.setScalar(s);
      }
    }

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

    if (this.p1VideoTex) this.p1VideoTex.needsUpdate = true;
    if (this.p2VideoTex) this.p2VideoTex.needsUpdate = true;

    this.composer.render();
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

  private makeGestureMesh(gesture: Gesture, color: number): THREE.Object3D {
    const mat = () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.4,
        roughness: 0.25,
        metalness: 0.7,
      });

    switch (gesture) {
      case 'rock': {
        return new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), mat());
      }
      case 'paper': {
        return new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 1.5), mat());
      }
      case 'scissors': {
        const g = new THREE.Group();
        const bladeGeo = new THREE.BoxGeometry(0.14, 1.1, 0.14);
        const b1 = new THREE.Mesh(bladeGeo, mat());
        b1.rotation.z = 0.35;
        b1.position.x = 0.18;
        const b2 = new THREE.Mesh(bladeGeo, mat());
        b2.rotation.z = -0.35;
        b2.position.x = -0.18;
        g.add(b1, b2);
        return g;
      }
      default: {
        return new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0x333344, wireframe: true })
        );
      }
    }
  }

  private setEmissiveIntensity(obj: THREE.Object3D, v: number): void {
    obj.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        (c.material as THREE.MeshStandardMaterial).emissiveIntensity = v;
      }
    });
  }

  private setColor(obj: THREE.Object3D, hex: number): void {
    obj.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        (c.material as THREE.MeshStandardMaterial).color.setHex(hex);
        (c.material as THREE.MeshStandardMaterial).emissive.setHex(hex);
      }
    });
  }

  private easeOutBack(t: number): number {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  private onResize = (): void => {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
