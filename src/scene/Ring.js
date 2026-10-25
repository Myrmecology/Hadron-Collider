/**
 * Hadron Collider — Collider ring visualization
 *
 * Draws the LHC along its exact design orbit (from MagnetLattice):
 *   • a see-through wireframe cryostat tube
 *   • the two beam apertures (Beam 1 / Beam 2) inside it
 *   • 1232 dipoles and the arc quadrupoles as instanced wireframe sleeves
 *   • the RF cavities at Point 4
 *   • labels for the eight LHC points and a faint ground grid
 *
 * VISUAL SCALE (rendering only; never used by the physics)
 *   Transverse dimensions are enlarged by RENDER.TRANSVERSE_EXAGGERATION so
 *   the tube is visible on a 26.7 km ring. The factor tapers to 1 (true
 *   scale) approaching IP1, and inside the detector the tube narrows to the
 *   real 23.5 mm beryllium beam pipe. Path length and geometry are exact.
 */
import * as THREE from 'three';
import { COLORS, DETECTOR, MACHINE, RENDER } from '../config/constants.js';
import { MagnetLattice } from '../physics/MagnetLattice.js';
import { RFCavity } from '../physics/RFCavity.js';

const CRYOSTAT_RADIUS = MACHINE.CRYOSTAT_OUTER_DIAMETER / 2;
const RADIAL = RENDER.RING_RADIAL_SEGMENTS;

/** Inside this distance from IP1 the tube becomes the detector beam pipe (m). */
const PIPE_INNER = DETECTOR.MUON_HALF_LENGTH + 1; // 23 m (triplet quadrupoles begin)
const PIPE_OUTER = 30;

/** Quadrupole magnetic length (LHC main quadrupole, MQ) in metres. */
const QUAD_LENGTH = 3.1;

const smoothstep = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/* =============================================================================
   Visual scale helpers (shared with BeamRenderer)
   ============================================================================= */

/** Transverse exaggeration factor at arc length s (1 = true scale). */
export function exaggerationAt(s) {
  const d = Math.abs(MagnetLattice.signedDistanceToIP1(s));
  const start = RENDER.EXAGGERATION_TAPER_START;
  const end = RENDER.EXAGGERATION_TAPER_END;
  if (d >= start) return RENDER.TRANSVERSE_EXAGGERATION;
  if (d <= end) return 1;
  const t = smoothstep((d - end) / (start - end));
  return 1 + (RENDER.TRANSVERSE_EXAGGERATION - 1) * t;
}

/** Drawn tube radius at s (m). */
export function tubeRadiusAt(s) {
  const d = Math.abs(MagnetLattice.signedDistanceToIP1(s));
  const cryostat = CRYOSTAT_RADIUS * exaggerationAt(s);
  if (d >= PIPE_OUTER) return cryostat;
  if (d <= PIPE_INNER) return DETECTOR.BEAM_PIPE_RADIUS;
  const t = smoothstep((d - PIPE_INNER) / (PIPE_OUTER - PIPE_INNER));
  return DETECTOR.BEAM_PIPE_RADIUS + (cryostat - DETECTOR.BEAM_PIPE_RADIUS) * t;
}

/**
 * Rendered world position for curvilinear coordinates (s, x, y), applying
 * the visual transverse exaggeration.
 */
export function renderPosition(s, x, y, out = new THREE.Vector3()) {
  const f = MagnetLattice.frameAt(s);
  const k = exaggerationAt(s);
  out.set(
    f.position.x + f.outward.x * x * k,
    y * k,
    f.position.z + f.outward.z * x * k,
  );
  return out;
}

/* =============================================================================
   Path sampling: uniform around the ring, dense near IP1
   ============================================================================= */
function samplePath() {
  const C = MagnetLattice.CIRCUMFERENCE;
  const set = new Set();
  for (let i = 0; i < RENDER.RING_PATH_SEGMENTS; i++) {
    set.add(Math.round(((i * C) / RENDER.RING_PATH_SEGMENTS) * 100) / 100);
  }
  const near = RENDER.EXAGGERATION_TAPER_START;
  for (let d = -near; d <= near; d += 1) {
    set.add(Math.round(MagnetLattice.wrap(d) * 100) / 100);
  }
  return [...set].sort((a, b) => a - b);
}

/* =============================================================================
   Label sprite
   ============================================================================= */
function makeLabel(title, subtitle) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 44px "IBM Plex Mono", Consolas, monospace';
  ctx.fillStyle = '#9fe1ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 46);
  ctx.font = '400 26px "IBM Plex Sans", system-ui, sans-serif';
  ctx.fillStyle = '#8597ab';
  ctx.fillText(subtitle, 256, 96);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(480, 120, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/* =============================================================================
   Ring
   ============================================================================= */
export class Ring {
  /** Root group added to the scene. */
  object = new THREE.Group();
  #labels = [];

  constructor() {
    this.object.name = 'CollderRing';
    const samples = samplePath();

    this.object.add(this.#buildTube(samples));
    this.object.add(this.#buildApertures(samples));
    this.object.add(this.#buildDipoles());
    this.object.add(this.#buildQuadrupoles());
    this.object.add(this.#buildRF());
    this.object.add(this.#buildLabels());
    this.object.add(this.#buildGrid());
  }

  /* ---------------------------------------------------------------- Tube */
  #buildTube(samples) {
    const n = samples.length;
    const rings = new Array(n);
    const v = new THREE.Vector3();

    // Cross-section vertices at every sample.
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const f = MagnetLattice.frameAt(s);
      const r = tubeRadiusAt(s);
      const ring = new Float32Array(RADIAL * 3);
      for (let k = 0; k < RADIAL; k++) {
        const a = (k / RADIAL) * Math.PI * 2;
        const cx = Math.cos(a) * r;
        const cy = Math.sin(a) * r;
        v.set(f.position.x + f.outward.x * cx, cy, f.position.z + f.outward.z * cx);
        ring.set([v.x, v.y, v.z], k * 3);
      }
      rings[i] = ring;
    }

    const positions = [];
    // Longitudinal lines (closing the loop back to the first sample).
    for (let i = 0; i < n; i++) {
      const a = rings[i];
      const b = rings[(i + 1) % n];
      for (let k = 0; k < RADIAL; k++) {
        positions.push(a[k * 3], a[k * 3 + 1], a[k * 3 + 2], b[k * 3], b[k * 3 + 1], b[k * 3 + 2]);
      }
    }
    // Circumferential hoops every few samples.
    for (let i = 0; i < n; i += 4) {
      const a = rings[i];
      for (let k = 0; k < RADIAL; k++) {
        const k2 = (k + 1) % RADIAL;
        positions.push(a[k * 3], a[k * 3 + 1], a[k * 3 + 2], a[k2 * 3], a[k2 * 3 + 1], a[k2 * 3 + 2]);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: COLORS.RING_WIREFRAME,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = 'CryostatWireframe';
    lines.frustumCulled = false;
    return lines;
  }

  /* ----------------------------------------------------------- Apertures */
  #buildApertures(samples) {
    const group = new THREE.Group();
    group.name = 'BeamApertures';
    const v = new THREE.Vector3();

    for (const [beam, color] of [
      [1, COLORS.BEAM1],
      [2, COLORS.BEAM2],
    ]) {
      const positions = new Float32Array((samples.length + 1) * 3);
      samples.forEach((s, i) => {
        renderPosition(s, MagnetLattice.apertureOffset(s, beam), 0, v);
        positions.set([v.x, v.y, v.z], i * 3);
      });
      positions.set(positions.subarray(0, 3), samples.length * 3); // close the loop

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      line.frustumCulled = false;
      group.add(line);
    }
    return group;
  }

  /* ------------------------------------------------- Instanced magnets */
  #instancedSleeves({ entries, length, radiusScale, radialSegments, color, opacity, name }) {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, radialSegments, 1, true);
    const material = new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    mesh.name = name;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();

    entries.forEach((entry, i) => {
      const f = MagnetLattice.frameAt(entry.s);
      const r = CRYOSTAT_RADIUS * exaggerationAt(entry.s) * radiusScale;
      tangent.set(f.tangent.x, f.tangent.y, f.tangent.z);
      q.setFromUnitVectors(up, tangent);
      pos.set(f.position.x, 0, f.position.z);
      scale.set(r, length, r);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  #buildDipoles() {
    return this.#instancedSleeves({
      entries: MagnetLattice.MAGNETS.dipoles,
      length: MACHINE.DIPOLE_MAGNETIC_LENGTH * 0.94,
      radiusScale: 1.08,
      radialSegments: 12,
      color: COLORS.MAGNET_DIPOLE,
      opacity: 0.16,
      name: 'Dipoles',
    });
  }

  #buildQuadrupoles() {
    return this.#instancedSleeves({
      entries: MagnetLattice.MAGNETS.quadrupoles,
      length: QUAD_LENGTH,
      radiusScale: 1.3,
      radialSegments: 8,
      color: COLORS.MAGNET_QUADRUPOLE,
      opacity: 0.5,
      name: 'Quadrupoles',
    });
  }

  /* ---------------------------------------------------------------- RF */
  #buildRF() {
    // 8 cavities per beam, grouped in cryomodules on either side of Point 4.
    const s0 = RFCavity.POSITION_S;
    const entries = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 8; k++) entries.push({ s: s0 + side * (40 + k * 6) });
    }
    return this.#instancedSleeves({
      entries,
      length: 4.5,
      radiusScale: 1.6,
      radialSegments: 16,
      color: COLORS.RF_CAVITY,
      opacity: 0.85,
      name: 'RFCavities',
    });
  }

  /* ------------------------------------------------------------ Labels */
  #buildLabels() {
    const group = new THREE.Group();
    group.name = 'PointLabels';
    for (const point of MagnetLattice.POINTS) {
      const title = point.collides ? `IP${point.point} · ${point.name}` : `P${point.point} · ${point.name}`;
      const sprite = makeLabel(title, point.role);
      const f = MagnetLattice.frameAt(point.s);
      // Place labels just outside the ring, above the tube.
      sprite.position.set(f.position.x + f.outward.x * 260, 160, f.position.z + f.outward.z * 260);
      sprite.userData.anchor = sprite.position.clone();
      group.add(sprite);
      this.#labels.push(sprite);
    }
    return group;
  }

  /* -------------------------------------------------------------- Grid */
  #buildGrid() {
    const center = MagnetLattice.RING_CENTER;
    const grid = new THREE.PolarGridHelper(6500, 16, 13, 160, 0x1b3550, 0x0e1c2b);
    grid.position.set(center.x, -90, center.z);
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const mat of materials) {
      mat.transparent = true;
      mat.opacity = 0.35;
      mat.depthWrite = false;
    }
    grid.name = 'GroundGrid';
    return grid;
  }

  /**
   * Per-frame update: fade labels that are very close to the camera, so they
   * never clutter the detector view.
   * @param {THREE.Camera} camera
   */
  update(camera) {
    for (const label of this.#labels) {
      const d = camera.position.distanceTo(label.userData.anchor);
      label.material.opacity = 0.9 * clamp01((d - 150) / 600);
      label.visible = label.material.opacity > 0.01;
    }
  }

  dispose() {
    this.object.traverse((obj) => {
      obj.geometry?.dispose?.();
      obj.material?.map?.dispose?.();
      obj.material?.dispose?.();
    });
  }
}