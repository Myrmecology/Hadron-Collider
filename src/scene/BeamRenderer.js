/**
 * Hadron Collider — Beam renderer
 *
 * Draws each proton bunch as a glowing head plus a fading trail along its
 * aperture. Positions come directly from the Accelerator's beam state
 * (curvilinear s, x, y), mapped through the Ring's visual scale.
 *
 * TRAIL LENGTH
 *   The trail spans the distance the bunch covers in TRAIL_TIME seconds of
 *   wall-clock time at the current effective time scale:
 *     L = v · scale · TRAIL_TIME,  clamped to [MIN_TRAIL, C].
 *   At 1× this exceeds the circumference (the beam appears as a continuous
 *   glowing ring); in deep slow motion it shrinks to a few metres.
 */
import * as THREE from 'three';
import { COLORS, RENDER } from '../config/constants.js';
import { MagnetLattice } from '../physics/MagnetLattice.js';
import { renderPosition } from './Ring.js';

const TRAIL_TIME = 0.12; // wall-clock seconds of motion shown in the trail
const MIN_TRAIL = 1.5; // m
const HEAD_SCREEN_FRACTION = 0.018; // head size relative to camera distance
const HEAD_MIN_SIZE = 0.004; // m
const HEAD_MAX_SIZE = 380; // m

/** Radial glow texture shared by both bunches. */
function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

class BunchVisual {
  /**
   * @param {1|2} beamId
   * @param {number} color
   * @param {THREE.Texture} texture
   */
  constructor(beamId, color, texture) {
    this.beamId = beamId;
    this.group = new THREE.Group();
    this.group.name = `Beam${beamId}`;

    // Head: outer halo + bright core.
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.halo.renderOrder = 20;
    this.core.renderOrder = 21;

    // Trail: a polyline with per-vertex color fading to black (additive → transparent).
    const n = RENDER.BEAM_TRAIL_POINTS;
    this.positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const fade = (1 - i / (n - 1)) ** 1.6;
      colors.set([c.r * fade, c.g * fade, c.b * fade], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttr);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.trail = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 19;

    this.group.add(this.trail, this.halo, this.core);
  }

  /**
   * @param {object} beam            Accelerator beam ({ s, x, y, aperture, direction })
   * @param {number} trailLength      metres
   * @param {THREE.Camera} camera
   */
  update(beam, trailLength, camera) {
    const head = renderPosition(beam.s, beam.aperture + beam.x, beam.y, this.halo.position);
    this.core.position.copy(head);

    // Size the glow relative to camera distance so it reads at every zoom level.
    const distance = camera.position.distanceTo(head);
    const size = THREE.MathUtils.clamp(distance * HEAD_SCREEN_FRACTION, HEAD_MIN_SIZE, HEAD_MAX_SIZE);
    this.halo.scale.setScalar(size * 2.4);
    this.core.scale.setScalar(size * 0.7);

    // Trail behind the head (opposite to the direction of motion).
    const n = RENDER.BEAM_TRAIL_POINTS;
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = beam.s - beam.direction * (i / (n - 1)) * trailLength;
      if (i === 0) {
        v.copy(head);
      } else {
        renderPosition(s, MagnetLattice.apertureOffset(s, beam.id), 0, v);
      }
      this.positions[i * 3] = v.x;
      this.positions[i * 3 + 1] = v.y;
      this.positions[i * 3 + 2] = v.z;
    }
    this.positionAttr.needsUpdate = true;
  }

  set visible(value) {
    this.group.visible = value;
  }

  dispose() {
    this.trail.geometry.dispose();
    this.trail.material.dispose();
    this.halo.material.dispose();
    this.core.material.dispose();
  }
}

export class BeamRenderer {
  object = new THREE.Group();
  #texture = glowTexture();
  #bunches;

  constructor() {
    this.object.name = 'Beams';
    this.#bunches = [
      new BunchVisual(1, COLORS.BEAM1, this.#texture),
      new BunchVisual(2, COLORS.BEAM2, this.#texture),
    ];
    for (const b of this.#bunches) this.object.add(b.group);
    this.object.visible = false;
  }

  /**
   * @param {import('../physics/Accelerator.js').Accelerator} accelerator
   * @param {number} effectiveScale  current clock time scale
   * @param {THREE.Camera} camera
   */
  update(accelerator, effectiveScale, camera) {
    const beams = accelerator.beams;
    this.object.visible = beams.length === 2;
    if (!this.object.visible) return;

    const trailLength = THREE.MathUtils.clamp(
      accelerator.speed * effectiveScale * TRAIL_TIME,
      MIN_TRAIL,
      MagnetLattice.CIRCUMFERENCE * 0.999,
    );

    beams.forEach((beam, i) => this.#bunches[i].update(beam, trailLength, camera));
  }

  /** World position of a beam's head (for the camera's Follow mode). */
  headPosition(index, out = new THREE.Vector3()) {
    return out.copy(this.#bunches[index].halo.position);
  }

  dispose() {
    for (const b of this.#bunches) b.dispose();
    this.#texture.dispose();
  }
}