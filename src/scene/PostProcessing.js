/**
 * Hadron Collider — Post-processing (bloom)
 *
 * Pipeline:
 *   RenderPass       scene → HDR target (half-float, 4× MSAA)
 *   UnrealBloomPass  multi-scale glow from pixels above the luminance threshold
 *   OutputPass       tone mapping + sRGB conversion (applied once, at the end)
 *
 * A half-float target keeps intensities above 1.0, so the collision flash
 * blooms brightly without clipping the rest of the frame. MSAA restores the
 * antialiasing that the default framebuffer would otherwise provide.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RENDER } from '../config/constants.js';

/** Extra bloom strength added at the moment of a collision. */
const SURGE_STRENGTH = 1.6;
/** Decay time constant of the surge (wall-clock seconds). */
const SURGE_DECAY = 0.35;

export class PostProcessing {
  #manager;
  #composer;
  #bloom;
  #target;
  #surge = 0;
  #enabled = true;
  #unsubscribeResize;

  /** @param {import('./SceneManager.js').SceneManager} manager */
  constructor(manager) {
    this.#manager = manager;
    const { renderer, scene, camera } = manager;

    this.#target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    });

    this.#composer = new EffectComposer(renderer, this.#target);
    this.#composer.addPass(new RenderPass(scene, camera));

    this.#bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      RENDER.BLOOM_STRENGTH,
      RENDER.BLOOM_RADIUS,
      RENDER.BLOOM_THRESHOLD,
    );
    this.#composer.addPass(this.#bloom);
    this.#composer.addPass(new OutputPass());

    this.#unsubscribeResize = manager.onResize((width, height) => {
      this.#composer.setPixelRatio(manager.pixelRatio);
      this.#composer.setSize(width, height);
      this.#bloom.resolution.set(width, height);
    });
  }

  /** Trigger a brief bloom surge (called on each collision). */
  surge() {
    this.#surge = SURGE_STRENGTH;
  }

  /** Toggle post-processing (falls back to a plain render when disabled). */
  set enabled(value) {
    this.#enabled = Boolean(value);
  }

  get enabled() {
    return this.#enabled;
  }

  /** @param {number} wallDt  wall-clock seconds since the last frame */
  update(wallDt) {
    if (this.#surge > 0) {
      this.#surge *= Math.exp(-wallDt / SURGE_DECAY);
      if (this.#surge < 0.01) this.#surge = 0;
    }
    this.#bloom.strength = RENDER.BLOOM_STRENGTH + this.#surge;
  }

  render() {
    if (this.#enabled) this.#composer.render();
    else this.#manager.render();
  }

  dispose() {
    this.#unsubscribeResize?.();
    this.#bloom.dispose();
    this.#composer.dispose();
    this.#target.dispose();
  }
}