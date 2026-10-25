/**
 * Hadron Collider — Camera director
 *
 * Three views, with smooth cinematic transitions between them:
 *   ring    overview of the whole collider (free orbit)
 *   follow  chase camera behind Beam 2, scaled to the local tube size
 *   ip      the detector at IP1 (free orbit around the collision point)
 *
 * Transitions interpolate the orbit target linearly and the camera distance
 * logarithmically, so kilometre-scale zooms read as steady, even motion.
 */
import * as THREE from 'three';
import { RENDER } from '../config/constants.js';
import { MagnetLattice } from '../physics/MagnetLattice.js';
import { exaggerationAt } from './Ring.js';

export const CAMERA_VIEW = Object.freeze({
  RING: 'ring',
  FOLLOW: 'follow',
  IP: 'ip',
});

const TRANSITION_DURATION = 2.0; // wall-clock seconds
const FOLLOW_SMOOTHING = 0.12; // time constant (s) for chase-camera easing
const FOLLOW_MAX_STEP = 400; // m per frame; faster beams switch to the approach view

/** Follow-camera offsets at full exaggeration (m); scaled down near the IP. */
const FOLLOW_BACK = 60;
const FOLLOW_UP = 14;
const FOLLOW_SIDE = 10;
const FOLLOW_AHEAD = 120;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class CameraDirector {
  #camera;
  #controls;
  #mode = CAMERA_VIEW.RING;
  #listeners = new Set();

  /** Active transition, or null. */
  #tween = null;

  #lastHead = new THREE.Vector3();
  #hasLastHead = false;

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} controls
   */
  constructor(camera, controls) {
    this.#camera = camera;
    this.#controls = controls;
    const view = this.#ringView();
    camera.position.copy(view.position);
    controls.target.copy(view.target);
    controls.update();
  }

  get mode() {
    return this.#mode;
  }

  /** Subscribe to mode changes (e.g. an automatic switch). Returns unsubscribe. */
  onModeChange(handler) {
    this.#listeners.add(handler);
    return () => this.#listeners.delete(handler);
  }

  /* ===========================================================================
     Canonical views
     =========================================================================== */
  #ringView() {
    const c = MagnetLattice.RING_CENTER;
    return {
      target: new THREE.Vector3(c.x, 0, c.z),
      position: new THREE.Vector3(c.x - 5200, 6200, c.z - 5200),
    };
  }

  #ipView() {
    // Outward side of the ring at IP1 is −x; view the detector from there.
    return {
      target: new THREE.Vector3(0, 0, 0),
      position: new THREE.Vector3(-26, 11, 24),
    };
  }

  /** Approach view: looking into IP1 along Beam 2's incoming direction. */
  #approachView() {
    return {
      target: new THREE.Vector3(0, 0, 0),
      position: new THREE.Vector3(-6, 3.5, -38),
    };
  }

  /* ===========================================================================
     Mode changes and transitions
     =========================================================================== */

  /**
   * Switch camera mode with a smooth transition.
   * @param {'ring'|'follow'|'ip'} mode
   * @param {{ silent?: boolean }} [options]  silent: don't notify listeners
   */
  setMode(mode, { silent = false } = {}) {
    if (!Object.values(CAMERA_VIEW).includes(mode)) return;
    const changed = mode !== this.#mode;
    this.#mode = mode;
    this.#hasLastHead = false;

    if (mode === CAMERA_VIEW.RING) this.#startTween(this.#ringView());
    else if (mode === CAMERA_VIEW.IP) this.#startTween(this.#ipView());
    else this.#tween = null; // follow mode eases continuously on its own

    this.#controls.enabled = mode !== CAMERA_VIEW.FOLLOW;

    if (changed && !silent) {
      for (const handler of [...this.#listeners]) handler(mode);
    }
  }

  /** Called when a collision occurs: chase view hands over to the detector. */
  onCollision() {
    if (this.#mode === CAMERA_VIEW.FOLLOW) this.setMode(CAMERA_VIEW.IP);
  }

  #startTween(to) {
    const fromTarget = this.#controls.target.clone();
    const fromOffset = this.#camera.position.clone().sub(fromTarget);
    const toOffset = to.position.clone().sub(to.target);

    this.#tween = {
      t: 0,
      fromTarget,
      toTarget: to.target.clone(),
      fromDir: fromOffset.clone().normalize(),
      toDir: toOffset.clone().normalize(),
      fromDist: Math.max(1e-3, fromOffset.length()),
      toDist: Math.max(1e-3, toOffset.length()),
    };
    this.#controls.enabled = false;
  }

  #stepTween(wallDt) {
    const tw = this.#tween;
    tw.t = Math.min(1, tw.t + wallDt / TRANSITION_DURATION);
    const e = easeInOutCubic(tw.t);

    const target = tw.fromTarget.clone().lerp(tw.toTarget, e);
    const dir = tw.fromDir.clone().lerp(tw.toDir, e).normalize();
    const dist = Math.exp(Math.log(tw.fromDist) * (1 - e) + Math.log(tw.toDist) * e);

    this.#controls.target.copy(target);
    this.#camera.position.copy(target).addScaledVector(dir, dist);
    this.#camera.lookAt(target);

    if (tw.t >= 1) {
      this.#tween = null;
      this.#controls.enabled = this.#mode !== CAMERA_VIEW.FOLLOW;
    }
  }

  /* ===========================================================================
     Per-frame update
     =========================================================================== */

  /**
   * @param {number} wallDt
   * @param {import('../physics/Accelerator.js').Accelerator} accelerator
   * @param {import('./BeamRenderer.js').BeamRenderer} beamRenderer
   */
  update(wallDt, accelerator, beamRenderer) {
    if (this.#tween) {
      this.#stepTween(wallDt);
      return;
    }
    if (this.#mode !== CAMERA_VIEW.FOLLOW) return;

    const beam = accelerator.beams[1]; // Beam 2
    if (!beam) {
      this.#ease(this.#approachView(), wallDt);
      return;
    }

    const head = beamRenderer.headPosition(1);
    const jump = this.#hasLastHead ? head.distanceTo(this.#lastHead) : 0;
    this.#lastHead.copy(head);
    this.#hasLastHead = true;

    // Too fast to follow: hold a steady approach view into IP1.
    if (jump > FOLLOW_MAX_STEP) {
      this.#ease(this.#approachView(), wallDt);
      return;
    }

    // Chase offsets scale with the drawn tube size (true scale near the IP).
    const k = Math.max(0.025, exaggerationAt(beam.s) / RENDER.TRANSVERSE_EXAGGERATION);
    const f = MagnetLattice.frameAt(beam.s);
    const forward = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).multiplyScalar(beam.direction);
    const outward = new THREE.Vector3(f.outward.x, 0, f.outward.z);

    const position = head
      .clone()
      .addScaledVector(forward, -FOLLOW_BACK * k)
      .addScaledVector(outward, FOLLOW_SIDE * k)
      .add(new THREE.Vector3(0, FOLLOW_UP * k, 0));
    const target = head.clone().addScaledVector(forward, FOLLOW_AHEAD * k);

    this.#ease({ position, target }, wallDt);
  }

  /** Frame-rate-independent exponential easing toward a view. */
  #ease(view, wallDt) {
    const a = 1 - Math.exp(-wallDt / FOLLOW_SMOOTHING);
    this.#camera.position.lerp(view.position, a);
    this.#controls.target.lerp(view.target, a);
    this.#camera.lookAt(this.#controls.target);
  }
}