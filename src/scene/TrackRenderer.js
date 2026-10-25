/**
 * Hadron Collider — Track renderer (event display)
 *
 * Draws a CollisionEvent the way experiment event displays do:
 *   • tracks colored by particle type, growing as the physics records points
 *   • glowing heads for particles still in flight
 *   • dashed missing-energy lines for neutrinos
 *   • calorimeter energy towers where particles are absorbed
 *     (height ∝ log energy; green ECAL, orange HCAL)
 *   • secondary-vertex markers for displaced decays (B, D, K_S, Λ, τ…)
 *   • a flash at the primary vertex at the moment of collision
 *
 * Rendering never alters the physics: it only reads Particle.track, status,
 * position, and momentum.
 */
import * as THREE from 'three';
import { COLORS, DETECTOR } from '../config/constants.js';
import { isParton } from '../data/particles.js';
import { STATUS } from '../physics/Particle.js';

const KIND_COLOR = {
  photon: COLORS.TRACK_PHOTON,
  electron: COLORS.TRACK_ELECTRON,
  muon: COLORS.TRACK_MUON,
  charged: COLORS.TRACK_CHARGED,
  neutral: COLORS.TRACK_NEUTRAL,
  neutrino: COLORS.TRACK_MET,
  jet: COLORS.TRACK_JET,
};

/** Opacity per kind: neutral particles leave no hits, so they are drawn faintly. */
const KIND_OPACITY = {
  photon: 0.85,
  electron: 0.95,
  muon: 1.0,
  charged: 0.8,
  neutral: 0.3,
  neutrino: 0.9,
  jet: 0.8,
};

/** Particles beyond this |η| go down the beam pipe; drawn very faintly. */
const FORWARD_ETA = 4.9;

const MAX_TOWERS = 3000;
const MAX_HEADS = 6000;
const MAX_VERTICES = 600;
const DISPLACED_MIN = 5e-4; // m: decays farther than 0.5 mm count as displaced
const FLASH_DURATION = 0.9; // wall-clock seconds

/* =============================================================================
   Shared resources
   ============================================================================= */
function flashTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(200,240,255,0.9)');
  g.addColorStop(0.4, 'rgba(92,200,255,0.25)');
  g.addColorStop(1, 'rgba(92,200,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* =============================================================================
   Track renderer
   ============================================================================= */
export class TrackRenderer {
  object = new THREE.Group();

  #event = null;
  /** @type {Map<number, { line: THREE.Line, positions: Float32Array, count: number, dashed: boolean }>} */
  #tracks = new Map();
  #absorbedSeen = new Set();
  #verticesSeen = new Set();
  #materials = new Map();

  #towers;
  #towerCount = 0;
  #heads;
  #headPositions = new Float32Array(MAX_HEADS * 3);
  #headColors = new Float32Array(MAX_HEADS * 3);
  #vertices;
  #vertexPositions = new Float32Array(MAX_VERTICES * 3);
  #vertexCount = 0;

  #flash;
  #flashAge = Infinity;

  constructor() {
    this.object.name = 'EventDisplay';

    this.#tracksGroup = new THREE.Group();
    this.object.add(this.#tracksGroup);

    this.#towers = this.#buildTowers();
    this.#heads = this.#buildHeads();
    this.#vertices = this.#buildVertexMarkers();
    this.#flash = this.#buildFlash();
    this.object.add(this.#towers, this.#heads, this.#vertices, this.#flash);
  }

  #tracksGroup;

  /* ---------------------------------------------------------------- Builders */
  #material(kind, forward) {
    const key = `${kind}:${forward ? 'fwd' : 'ctr'}`;
    if (this.#materials.has(key)) return this.#materials.get(key);

    const color = KIND_COLOR[kind] ?? COLORS.TRACK_CHARGED;
    const opacity = (KIND_OPACITY[kind] ?? 0.8) * (forward ? 0.18 : 1);
    const common = {
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    };
    const material =
      kind === 'neutrino' || kind === 'neutral'
        ? new THREE.LineDashedMaterial({ ...common, dashSize: kind === 'neutrino' ? 0.25 : 0.08, gapSize: kind === 'neutrino' ? 0.15 : 0.08 })
        : new THREE.LineBasicMaterial(common);
    this.#materials.set(key, material);
    return material;
  }

  #buildTowers() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0); // grow from the base along +y
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_TOWERS);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.name = 'CaloTowers';
    return mesh;
  }

  #buildHeads() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.#headPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.#headColors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 5,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    points.frustumCulled = false;
    points.renderOrder = 30;
    return points;
  }

  #buildVertexMarkers() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.#vertexPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 6,
        sizeAttenuation: false,
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    points.frustumCulled = false;
    points.renderOrder = 31;
    return points;
  }

  #buildFlash() {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flashTexture(),
        color: COLORS.COLLISION_FLASH,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sprite.renderOrder = 40;
    sprite.visible = false;
    return sprite;
  }

  /* ----------------------------------------------------------------- Events */

  /** Display a new collision event (clears the previous one). */
  setEvent(event) {
    this.clear();
    this.#event = event;
    this.#flash.position.set(event.vertex.x, event.vertex.y, event.vertex.z);
    this.#flash.visible = true;
    this.#flashAge = 0;
  }

  clear() {
    for (const track of this.#tracks.values()) {
      this.#tracksGroup.remove(track.line);
      track.line.geometry.dispose();
    }
    this.#tracks.clear();
    this.#absorbedSeen.clear();
    this.#verticesSeen.clear();
    this.#towerCount = 0;
    this.#towers.count = 0;
    this.#vertexCount = 0;
    this.#vertices.geometry.setDrawRange(0, 0);
    this.#heads.geometry.setDrawRange(0, 0);
    this.#event = null;
  }

  /* ----------------------------------------------------------------- Update */

  /**
   * @param {number} wallDt  wall-clock seconds since last frame
   * @param {THREE.Camera} camera
   */
  update(wallDt, camera) {
    this.#updateFlash(wallDt, camera);
    const event = this.#event;
    if (!event) return;

    let heads = 0;
    const color = new THREE.Color();

    for (const p of event.particles) {
      if (isParton(p.pdg)) continue;
      this.#syncTrack(p);

      if (p.isAlive && heads < MAX_HEADS) {
        color.set(KIND_COLOR[p.displayKind] ?? COLORS.TRACK_CHARGED);
        this.#headPositions.set([p.position.x, p.position.y, p.position.z], heads * 3);
        this.#headColors.set([color.r, color.g, color.b], heads * 3);
        heads += 1;
      }

      if (p.status === STATUS.ABSORBED && !this.#absorbedSeen.has(p.id)) {
        this.#absorbedSeen.add(p.id);
        if (p.absorbedIn === 'ECAL' || p.absorbedIn === 'HCAL') this.#addTower(p);
      }

      if (p.status === STATUS.DECAYED && !this.#verticesSeen.has(p.id)) {
        this.#verticesSeen.add(p.id);
        if (p.flightDistance > DISPLACED_MIN && this.#vertexCount < MAX_VERTICES) {
          this.#vertexPositions.set([p.position.x, p.position.y, p.position.z], this.#vertexCount * 3);
          this.#vertexCount += 1;
          this.#vertices.geometry.setDrawRange(0, this.#vertexCount);
          this.#vertices.geometry.attributes.position.needsUpdate = true;
        }
      }
    }

    this.#heads.geometry.setDrawRange(0, heads);
    this.#heads.geometry.attributes.position.needsUpdate = true;
    this.#heads.geometry.attributes.color.needsUpdate = true;
  }

  /** Create or extend the line for one particle from its recorded track. */
  #syncTrack(p) {
    const points = p.trackLength;
    let track = this.#tracks.get(p.id);

    if (!track) {
      if (points < 1) return;
      const forward = Math.abs(p.momentum.eta) > FORWARD_ETA;
      const capacity = Math.max(64, points * 2);
      const positions = new Float32Array(capacity * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setDrawRange(0, 0);
      const material = this.#material(p.displayKind, forward);
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      line.renderOrder = 25;
      this.#tracksGroup.add(line);
      track = { line, positions, count: 0, dashed: material.isLineDashedMaterial === true };
      this.#tracks.set(p.id, track);
    }

    if (points === track.count) return;

    // Grow the buffer if needed (doubling).
    if (points > track.positions.length / 3) {
      const bigger = new Float32Array(points * 2 * 3);
      bigger.set(track.positions.subarray(0, track.count * 3));
      track.positions = bigger;
      track.line.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(bigger, 3).setUsage(THREE.DynamicDrawUsage),
      );
    }

    const src = p.track;
    for (let i = track.count; i < points; i++) {
      track.positions[i * 3] = src[i * 4];
      track.positions[i * 3 + 1] = src[i * 4 + 1];
      track.positions[i * 3 + 2] = src[i * 4 + 2];
    }
    track.count = points;

    const geometry = track.line.geometry;
    geometry.setDrawRange(0, points);
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();
    if (track.dashed) track.line.computeLineDistances();
  }

  /** Calorimeter tower at the absorption point, pointing away from the beam. */
  #addTower(p) {
    if (this.#towerCount >= MAX_TOWERS) return;
    const pos = new THREE.Vector3(p.position.x, p.position.y, p.position.z);
    const r = Math.hypot(pos.x, pos.y);

    // Barrel towers point radially; end-cap towers point along ±z.
    const halfLength = p.absorbedIn === 'ECAL' ? DETECTOR.ECAL_HALF_LENGTH : DETECTOR.HCAL_HALF_LENGTH;
    const inBarrel = Math.abs(pos.z) < halfLength;
    const dir = inBarrel
      ? new THREE.Vector3(pos.x / (r || 1), pos.y / (r || 1), 0)
      : new THREE.Vector3(0, 0, Math.sign(pos.z) || 1);

    const height = 0.12 + 0.42 * Math.log10(1 + p.momentum.E);
    const width = p.absorbedIn === 'ECAL' ? 0.07 : 0.14;

    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(width, height, width));
    this.#towers.setMatrixAt(this.#towerCount, m);
    this.#towers.setColorAt(
      this.#towerCount,
      new THREE.Color(p.absorbedIn === 'ECAL' ? COLORS.DETECTOR_ECAL : COLORS.DETECTOR_HCAL),
    );
    this.#towerCount += 1;
    this.#towers.count = this.#towerCount;
    this.#towers.instanceMatrix.needsUpdate = true;
    if (this.#towers.instanceColor) this.#towers.instanceColor.needsUpdate = true;
  }

  /** Collision flash: expands and fades over FLASH_DURATION of wall time. */
  #updateFlash(wallDt, camera) {
    if (!Number.isFinite(this.#flashAge)) return;
    this.#flashAge += wallDt;
    const t = this.#flashAge / FLASH_DURATION;
    if (t >= 1) {
      this.#flash.visible = false;
      this.#flashAge = Infinity;
      return;
    }
    // Size scales with camera distance so the flash reads at any zoom level.
    const distance = camera.position.distanceTo(this.#flash.position);
    const base = THREE.MathUtils.clamp(distance * 0.06, 0.05, 600);
    this.#flash.scale.setScalar(base * (0.4 + 2.2 * t));
    this.#flash.material.opacity = (1 - t) ** 2;
  }

  dispose() {
    this.clear();
    for (const m of this.#materials.values()) m.dispose();
    this.#towers.geometry.dispose();
    this.#towers.material.dispose();
    this.#heads.geometry.dispose();
    this.#heads.material.dispose();
    this.#vertices.geometry.dispose();
    this.#vertices.material.dispose();
    this.#flash.material.map?.dispose();
    this.#flash.material.dispose();
  }
}