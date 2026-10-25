/**
 * Hadron Collider — Scene manager
 *
 * Owns the WebGL renderer, scene graph, camera, and orbit controls.
 * Other scene modules (Ring, Detector, BeamRenderer, TrackRenderer,
 * CameraDirector, PostProcessing) attach to it.
 *
 * SCALE
 *   World units are metres. IP1 is the origin; the ring extends ~8.5 km.
 *   A logarithmic depth buffer keeps depth precision across 23 mm (beam
 *   pipe) to tens of kilometres (far plane) without z-fighting.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLORS, RENDER } from '../config/constants.js';

/** Maximum device pixel ratio (sharp on HiDPI, bounded GPU cost). */
const MAX_PIXEL_RATIO = 2;

export class SceneManager {
  /** @type {THREE.WebGLRenderer} */
  renderer;
  /** @type {THREE.Scene} */
  scene;
  /** @type {THREE.PerspectiveCamera} */
  camera;
  /** @type {OrbitControls} */
  controls;

  #canvas;
  #resizeObserver;
  #resizeHandlers = new Set();
  #width = 1;
  #height = 1;

  /**
   * @param {HTMLCanvasElement} canvas
   * @throws {Error} if WebGL2 is unavailable
   */
  constructor(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError('SceneManager: a <canvas> element is required.');
    }
    this.#canvas = canvas;

    if (!SceneManager.isWebGL2Available()) {
      throw new Error('WebGL2 is not available in this browser. Please use a current version of Chrome, Edge, Firefox, or Safari.');
    }

    /* --------------------------------------------------------------- Renderer */
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(COLORS.BACKGROUND, 1);

    /* ------------------------------------------------------------------ Scene */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.BACKGROUND);
    // Very faint exponential fog: distant arcs recede without hiding structure.
    this.scene.fog = new THREE.FogExp2(COLORS.BACKGROUND, 0.000045);

    /* ----------------------------------------------------------------- Lights */
    // Detector structures use lit materials; wireframes and glows are unlit.
    const ambient = new THREE.AmbientLight(0x8fb4d9, 0.55);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(30, 60, 40);
    const rim = new THREE.DirectionalLight(0x5cc8ff, 0.6);
    rim.position.set(-40, -10, -30);
    this.scene.add(ambient, key, rim);

    /* ----------------------------------------------------------------- Camera */
    this.camera = new THREE.PerspectiveCamera(RENDER.CAMERA_FOV, 1, RENDER.CAMERA_NEAR, RENDER.CAMERA_FAR);
    this.camera.position.set(-2600, 3800, -2600);
    this.camera.lookAt(4200, 0, 0);

    /* --------------------------------------------------------------- Controls */
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 1.1;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 40_000;
    this.controls.screenSpacePanning = true;
    this.controls.target.set(4200, 0, 0);

    /* ----------------------------------------------------------------- Resize */
    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    this.#resizeObserver.observe(canvas);
    this.#resize();
  }

  /** True if the browser can create a WebGL2 context. */
  static isWebGL2Available() {
    try {
      const test = document.createElement('canvas');
      return Boolean(window.WebGL2RenderingContext && test.getContext('webgl2'));
    } catch {
      return false;
    }
  }

  #resize() {
    const width = Math.max(1, this.#canvas.clientWidth);
    const height = Math.max(1, this.#canvas.clientHeight);
    if (width === this.#width && height === this.#height) return;

    this.#width = width;
    this.#height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    for (const handler of this.#resizeHandlers) handler(width, height);
  }

  /**
   * Register a callback for viewport size changes (e.g. post-processing).
   * The handler is called immediately with the current size.
   * @returns {() => void} unsubscribe
   */
  onResize(handler) {
    this.#resizeHandlers.add(handler);
    handler(this.#width, this.#height);
    return () => this.#resizeHandlers.delete(handler);
  }

  get width() {
    return this.#width;
  }

  get height() {
    return this.#height;
  }

  get pixelRatio() {
    return this.renderer.getPixelRatio();
  }

  /** Add one or more objects to the scene. */
  add(...objects) {
    this.scene.add(...objects);
  }

  /** Update controls (call once per frame before rendering). */
  update() {
    this.controls.update();
  }

  /** Plain render (used when post-processing is unavailable). */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Release GPU resources and listeners. */
  dispose() {
    this.#resizeObserver.disconnect();
    this.#resizeHandlers.clear();
    this.controls.dispose();
    this.scene.traverse((obj) => {
      obj.geometry?.dispose?.();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of materials) m?.dispose?.();
    });
    this.renderer.dispose();
  }
}