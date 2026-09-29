import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Camera looks down at the world from a steep angle and follows the player.
export class Renderer3D {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  private target = new THREE.Vector3();
  private followPos = new THREE.Vector3();
  private readonly tilt = THREE.MathUtils.degToRad(50);
  private distance = 18;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private ao: GTAOPass | null = null;
  readonly isMobile: boolean;
  quality: 'high' | 'low' = 'high';

  constructor(private container: HTMLElement) {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    this.isMobile = isMobile;
    this.renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 2 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    // bright, sunny, toy-box world
    this.scene.background = new THREE.Color(0xa9dcff);
    this.scene.fog = new THREE.Fog(0xa9dcff, 34, 70);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 140);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.28;

    const hemi = new THREE.HemisphereLight(0xcfe9ff, 0xf1d5b8, 0.5);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 80;
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 18;
    this.sun.shadow.camera.bottom = -18;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.35);
    fill.position.set(-8, 10, -6);
    this.scene.add(fill);

    // a soft glow on bright things (fridge lights, register screens, the elevator lamp); desktop only, phones keep the raw frame
    if (!isMobile) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      try {
        this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
        this.ao.output = GTAOPass.OUTPUT.Default;
        this.ao.blendIntensity = 0.7;
        this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2, samples: 12 });
        this.composer.addPass(this.ao);
      } catch {
        this.ao = null;
      }
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.5, 1.3);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    // keep about 10 tiles visible across the screen whatever the shape of the screen
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const wanted = 10.5 / (2 * Math.tan(halfFov) * this.camera.aspect);
    this.distance = THREE.MathUtils.clamp(wanted, 13, 26);
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.ao?.setSize(w, h);
    this.bloom?.setSize(w / 2, h / 2);
  }

  snapTo(x: number, z: number): void {
    this.followPos.set(x, 0, z);
    this.placeCamera();
  }

  follow(x: number, z: number, dt: number): void {
    this.target.set(x, 0, z);
    const k = 1 - Math.pow(0.001, dt);
    this.followPos.lerp(this.target, k);
    this.placeCamera();
  }

  private placeCamera(): void {
    const d = this.distance;
    this.camera.position.set(this.followPos.x, Math.sin(this.tilt) * d, this.followPos.z + Math.cos(this.tilt) * d);
    this.camera.lookAt(this.followPos.x, 0.4, this.followPos.z);
    this.sun.position.set(this.followPos.x - 9, 22, this.followPos.z + 11);
    this.sun.target.position.set(this.followPos.x, 0, this.followPos.z);
  }

  // world position -> screen pixel position (for DOM overlays)
  project(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * this.container.clientWidth, y: (1 - p.y) / 2 * this.container.clientHeight };
  }

  // Low quality: no shadows, no post-processing, half the pixels. Used automatically when frames get slow.
  setQuality(q: 'high' | 'low'): void {
    if (q === this.quality) return;
    this.quality = q;
    const low = q === 'low';
    this.renderer.shadowMap.enabled = !low;
    this.sun.castShadow = !low;
    this.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 2));
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of mats) mm.needsUpdate = true;
      }
    });
    this.resize();
  }

  render(): void {
    if (this.composer && this.quality === 'high') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
